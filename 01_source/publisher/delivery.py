"""公開用JSONだけを読む転送担当。SQLite・Web API・PHP・秘密設定には接続しません。"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from datetime import date, datetime, timedelta, timezone

MAX_BYTES = 131072
STATUSES = {"maintenance", "reserved", "morning_available", "afternoon_available"}
JST = timezone(timedelta(hours=9))


def validate(raw: bytes, now: datetime) -> dict:
    """転送直前にも許可項目・3か月の範囲を検証し、内部データの誤送信を防ぎます。"""
    if len(raw) > MAX_BYTES:
        raise ValueError("公開JSONのサイズが上限を超えています")
    data = json.loads(raw)
    expected = {"schemaVersion", "sourceVersion", "updatedAt", "rangeStart", "rangeEnd", "rooms", "availability"}
    if not isinstance(data, dict) or set(data) != expected or data["schemaVersion"] != 2:
        raise ValueError("公開JSONの項目が不正です")
    if type(data["sourceVersion"]) is not int or data["sourceVersion"] < 1:
        raise ValueError("公開JSONの版番号が不正です")
    start = date.fromisoformat(data["rangeStart"])
    end = date.fromisoformat(data["rangeEnd"])
    today = now.astimezone(JST).date()
    month_end_index = start.year * 12 + start.month - 1 + 3
    expected_end = date(month_end_index // 12, month_end_index % 12 + 1, 1) - timedelta(days=1)
    if start != today.replace(day=1) or end != expected_end:
        raise ValueError("公開JSONの期間が当月を含む3か月と一致しません。再生成してください")
    updated = datetime.fromisoformat(data["updatedAt"])
    if updated.tzinfo is None or updated > now + timedelta(minutes=5):
        raise ValueError("公開JSONの更新日時が不正です")
    rooms = data["rooms"]
    if not isinstance(rooms, list) or not 1 <= len(rooms) <= 32:
        raise ValueError("公開する試験室の件数が不正です")
    ids = set()
    for room in rooms:
        if not isinstance(room, dict) or set(room) != {"id", "name", "image", "description"}:
            raise ValueError("試験室の項目が不正です")
        if not all(isinstance(room[key], str) for key in room):
            raise ValueError("試験室情報の形式が不正です")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", room["id"]) or room["id"] in ids:
            raise ValueError("試験室IDが不正です")
        if not room["name"].strip() or len(room["name"].encode()) > 300 or len(room["description"].encode()) > 900:
            raise ValueError("試験室名・説明が不正です")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.png", room["image"]):
            raise ValueError("試験室画像名が不正です")
        ids.add(room["id"])
    availability = data["availability"]
    if not isinstance(availability, dict) or set(availability) != ids:
        raise ValueError("試験室の構成が不正です")
    for days in availability.values():
        # PHPでは予約なしの連想配列が空の配列[]になるため、空配列だけ許可します。
        if days == []:
            continue
        if not isinstance(days, dict):
            raise ValueError("空き状況の形式が不正です")
        for day, status in days.items():
            parsed = date.fromisoformat(day)
            if parsed.isoformat() != day or not start <= parsed <= end or status not in STATUSES:
                raise ValueError("空き状況の日付・状態が不正です")
    return data


def atomic_write(path: Path, contents: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    descriptor, temporary = tempfile.mkstemp(prefix=".kptc-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(contents)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Delivery:
    def __init__(self, environment=None):
        env = os.environ if environment is None else environment
        self.mode = env.get("KPTC_AVAILABILITY_DELIVERY_MODE", "local")
        if self.mode not in {"local", "sftp"}:
            raise ValueError("KPTC_AVAILABILITY_DELIVERY_MODEはlocalまたはsftpです")
        self.source = Path(env.get("KPTC_AVAILABILITY_SOURCE_JSON", "/var/lib/kptc-outbox/public-availability.json"))
        self.status_path = Path(env.get("KPTC_AVAILABILITY_STATUS_JSON", "/var/lib/kptc-publish-status/status.json"))
        self.local_path = Path(env.get("KPTC_AVAILABILITY_LOCAL_JSON", "/var/lib/kptc-public/public-availability.json"))
        self.interval = int(env.get("KPTC_AVAILABILITY_INTERVAL", "30"))
        self.stale_seconds = int(env.get("KPTC_PUBLIC_AVAILABILITY_STALE_SECONDS", "1800"))
        if not 5 <= self.interval <= 300 or not 600 <= self.stale_seconds <= 86400:
            raise ValueError("確認間隔は5～300秒、更新期限は600～86400秒で設定してください")
        self.host = env.get("KPTC_AVAILABILITY_SFTP_HOST", "")
        self.user = env.get("KPTC_AVAILABILITY_SFTP_USER", "kptc-upload")
        self.port = int(env.get("KPTC_AVAILABILITY_SFTP_PORT", "22"))
        self.directory = env.get("KPTC_AVAILABILITY_SFTP_DIRECTORY", "/data")
        self.key = Path(env.get("KPTC_AVAILABILITY_SFTP_KEY", "/run/kptc-sftp/id_ed25519"))
        self.known_hosts = Path(env.get("KPTC_AVAILABILITY_SFTP_KNOWN_HOSTS", "/run/kptc-sftp/known_hosts"))
        if self.mode == "sftp":
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,252}", self.host):
                raise ValueError("SFTPホストはホスト名またはIPv4アドレスで設定してください")
            if not re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}", self.user) or self.user == "root" or not 1 <= self.port <= 65535:
                raise ValueError("SFTP専用ユーザー・ポートが不正です")
            if not re.fullmatch(r"/[A-Za-z0-9/_-]+", self.directory) or ".." in self.directory:
                raise ValueError("SFTP保存先は空白を含まない専用ディレクトリで指定してください")
        target = str(self.local_path) if self.mode == "local" else f"{self.user}@{self.host}:{self.port}{self.directory}"
        self.target_hash = hashlib.sha256((self.mode + ":" + target).encode()).hexdigest()

    def status(self):
        try:
            data = json.loads(self.status_path.read_bytes()[:65536])
            return data if isinstance(data, dict) and data.get("targetHash") == self.target_hash else {}
        except (OSError, ValueError):
            return {}

    def sftp(self, raw: bytes) -> None:
        if not self.key.is_file() or not self.known_hosts.is_file():
            raise ValueError("SFTP秘密鍵またはknown_hostsがありません")
        if self.key.stat().st_mode & 0o077:
            raise ValueError("SFTP秘密鍵の権限を600にしてください")
        remote = self.directory.rstrip("/") + "/public-availability.json"
        temporary = self.directory.rstrip("/") + "/.public-availability.json.upload"
        with tempfile.TemporaryDirectory(prefix="kptc-sftp-") as work:
            local = Path(work) / "public-availability.json"
            local.write_bytes(raw)
            batch = f'-rm "{temporary}"\nput "{local}" "{temporary}"\nchmod 0644 "{temporary}"\nrename "{temporary}" "{remote}"\n'
            command = ["sftp", "-F", "/dev/null", "-b", "-", "-i", str(self.key), "-P", str(self.port)]
            for setting in ["BatchMode=yes", "IdentitiesOnly=yes", "StrictHostKeyChecking=yes", f"UserKnownHostsFile={self.known_hosts}", "ForwardAgent=no", "ClearAllForwardings=yes", "PasswordAuthentication=no", "KbdInteractiveAuthentication=no", "ConnectTimeout=10", "ConnectionAttempts=1", "ServerAliveInterval=5", "ServerAliveCountMax=2"]:
                command.extend(["-o", setting])
            command.append(f"{self.user}@{self.host}")
            try:
                result = subprocess.run(command, input=batch, text=True, capture_output=True, timeout=45, check=False)
            except subprocess.TimeoutExpired as error:
                raise RuntimeError("SFTP転送が時間切れになりました") from error
            if result.returncode:
                # 接続先が返した文字列をWeb表示やログへそのまま流しません。
                raise RuntimeError("SFTP転送に失敗しました。接続・公開鍵・ホスト鍵・保存先の権限を確認してください")

    def once(self, now=None) -> bool:
        now = datetime.now(timezone.utc) if now is None else now
        self.status_path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        with (self.status_path.parent / ".delivery.lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
            previous = self.status()
            status = {**previous, "targetHash": self.target_hash, "mode": self.mode, "lastAttemptAt": now.isoformat()}
            try:
                if self.source.is_symlink():
                    raise ValueError("公開JSONのリンクは転送できません")
                with self.source.open("rb") as source:
                    raw = source.read(MAX_BYTES + 1)
                payload = validate(raw, now)
                if (now - datetime.fromisoformat(payload["updatedAt"])).total_seconds() > self.stale_seconds:
                    raise ValueError("公開JSONの更新が古いため転送を停止しました。Schedulerの生成処理を確認してください")
                # 月・版・生成時刻が逆行したファイルは、正常配信済みデータへ上書きしません。
                generation = (payload["rangeStart"], payload["sourceVersion"], datetime.fromisoformat(payload["updatedAt"]).timestamp())
                old_generation = previous.get("generation")
                if isinstance(old_generation, list) and generation < tuple(old_generation):
                    raise ValueError("配信済みの情報より古いJSONは転送できません")
                checksum = hashlib.sha256(raw).hexdigest()
                unchanged = previous.get("ok") is True and previous.get("sha256") == checksum
                if self.mode == "local":
                    existing_raw = None
                    if self.local_path.is_file():
                        with self.local_path.open("rb") as existing_file:
                            existing_raw = existing_file.read(MAX_BYTES + 1)
                        try:
                            existing = validate(existing_raw, now)
                        except (ValueError, TypeError):
                            existing = None
                        if existing:
                            existing_generation = (existing["rangeStart"], existing["sourceVersion"], datetime.fromisoformat(existing["updatedAt"]).timestamp())
                            if generation < existing_generation:
                                raise ValueError("公開先にある情報より古いJSONは上書きできません")
                    if existing_raw != raw:
                        atomic_write(self.local_path, raw)
                        unchanged = False
                elif not unchanged:
                    self.sftp(raw)
                status.update(ok=True, sourceVersion=payload["sourceVersion"], generation=list(generation), sha256=checksum, lastSuccessAt=previous.get("lastSuccessAt") if unchanged else now.isoformat(), consecutiveFailures=0, lastError="")
            except (OSError, ValueError, TypeError, RuntimeError) as error:
                status.update(ok=False, consecutiveFailures=int(previous.get("consecutiveFailures", 0)) + 1, lastError=str(error)[:500])
            atomic_write(self.status_path, (json.dumps(status, ensure_ascii=False) + "\n").encode())
            print(json.dumps({key: status.get(key) for key in ["ok", "mode", "sourceVersion", "lastAttemptAt", "consecutiveFailures", "lastError"]}, ensure_ascii=False), flush=True)
            return status["ok"]

    def healthy(self) -> bool:
        status = self.status()
        try:
            return status.get("ok") is True and (datetime.now(timezone.utc) - datetime.fromisoformat(status["lastSuccessAt"])).total_seconds() <= self.stale_seconds
        except (KeyError, ValueError, TypeError):
            return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--health", action="store_true")
    args = parser.parse_args()
    delivery = Delivery()
    if args.health:
        return 0 if delivery.healthy() else 1
    if args.once:
        return 0 if delivery.once() else 1
    while True:
        delivery.once()
        time.sleep(delivery.interval)


if __name__ == "__main__":
    raise SystemExit(main())

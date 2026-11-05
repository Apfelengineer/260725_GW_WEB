"""実ファイルを使うlocal配信と、SFTPの権限制限・失敗時保持を検証します。"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("delivery", ROOT / "publisher/delivery.py")
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)
NOW = datetime(2026, 11, 6, 0, 0, tzinfo=timezone.utc)


def payload(version=10):
    return {"schemaVersion": 2, "sourceVersion": version, "updatedAt": NOW.isoformat(), "rangeStart": "2026-11-01", "rangeEnd": "2027-01-31", "rooms": [{"id": "m6", "name": "試験室", "image": "m6.png", "description": ""}], "availability": {"m6": {"2026-11-06": "reserved"}}}


class DeliveryTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="kptc-delivery-")
        self.root = Path(self.temporary.name)
        self.env = {"KPTC_AVAILABILITY_SOURCE_JSON": str(self.root / "outbox/public-availability.json"), "KPTC_AVAILABILITY_LOCAL_JSON": str(self.root / "public/public-availability.json"), "KPTC_AVAILABILITY_STATUS_JSON": str(self.root / "status/status.json")}
        self.source = Path(self.env["KPTC_AVAILABILITY_SOURCE_JSON"])
        self.source.parent.mkdir()
        self.output = Path(self.env["KPTC_AVAILABILITY_LOCAL_JSON"])

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, data):
        self.source.write_text(json.dumps(data))

    def test_local_atomic_publish_and_repeat(self):
        self.write(payload())
        worker = delivery.Delivery(self.env)
        self.assertTrue(worker.once(NOW))
        self.assertEqual(json.loads(self.output.read_bytes()), payload())
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o644)
        before = self.output.stat().st_mtime_ns
        self.assertTrue(worker.once(NOW + timedelta(seconds=30)))
        self.assertEqual(self.output.stat().st_mtime_ns, before)
        self.assertEqual(worker.status()["sourceVersion"], 10)
        self.assertEqual(len(list(self.output.parent.iterdir())), 1)

    def test_invalid_private_information_never_replaces_good_json(self):
        self.write(payload())
        worker = delivery.Delivery(self.env)
        worker.once(NOW)
        good = self.output.read_bytes()
        bad = {**payload(11), "schedules": [{"title": "非公開の予定"}]}
        self.write(bad)
        self.assertFalse(worker.once(NOW))
        self.assertEqual(self.output.read_bytes(), good)
        self.assertEqual(worker.status()["consecutiveFailures"], 1)
        self.assertEqual(worker.status()["sourceVersion"], 10)
        self.write(payload(11))
        self.assertTrue(worker.once(NOW))
        self.assertEqual(worker.status()["consecutiveFailures"], 0)

    def test_stale_missing_oversized_and_old_generation_preserve_last_good(self):
        self.write(payload())
        worker = delivery.Delivery(self.env)
        worker.once(NOW)
        good = self.output.read_bytes()
        self.assertFalse(worker.once(NOW + timedelta(minutes=31)))
        self.write(payload(9))
        self.assertFalse(worker.once(NOW))
        self.source.write_bytes(b" " * 131073)
        self.assertFalse(worker.once(NOW))
        self.source.unlink()
        self.assertFalse(worker.once(NOW))
        self.assertEqual(self.output.read_bytes(), good)

    def test_month_boundary_rejects_previous_range(self):
        self.write(payload())
        self.assertFalse(delivery.Delivery(self.env).once(datetime(2026, 12, 1, tzinfo=timezone.utc)))
        self.assertFalse(self.output.exists())

    def test_status_loss_does_not_overwrite_newer_local_publication(self):
        self.write(payload(12))
        worker = delivery.Delivery(self.env)
        self.assertTrue(worker.once(NOW))
        worker.status_path.unlink()
        self.write(payload(11))
        self.assertFalse(worker.once(NOW))
        self.assertEqual(json.loads(self.output.read_bytes())["sourceVersion"], 12)

    def sftp_env(self):
        key = self.root / "key"
        key.write_text("dummy-test-key")
        key.chmod(0o600)
        known = self.root / "known_hosts"
        known.write_text("dummy-test-host")
        return {**self.env, "KPTC_AVAILABILITY_DELIVERY_MODE": "sftp", "KPTC_AVAILABILITY_SFTP_HOST": "tamanegi.example.jp", "KPTC_AVAILABILITY_SFTP_KEY": str(key), "KPTC_AVAILABILITY_SFTP_KNOWN_HOSTS": str(known)}

    def test_sftp_restricted_connection_and_atomic_batch(self):
        self.write(payload())
        env = self.sftp_env()
        worker = delivery.Delivery(env)
        with patch.object(delivery.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as runner:
            self.assertTrue(worker.once(NOW))
            args = runner.call_args.args[0]
            self.assertEqual(args[-1], "kptc-upload@tamanegi.example.jp")
            self.assertIn("StrictHostKeyChecking=yes", args)
            self.assertIn("ForwardAgent=no", args)
            self.assertIn("ClearAllForwardings=yes", args)
            self.assertNotIn("shell", runner.call_args.kwargs)
            batch = runner.call_args.kwargs["input"]
            self.assertIn('rename "/data/.public-availability.json.upload" "/data/public-availability.json"', batch)
            self.assertTrue(worker.once(NOW + timedelta(seconds=30)))
            self.assertEqual(runner.call_count, 1)
        self.assertFalse(self.output.exists())

    def test_sftp_failure_and_timeout_retry_without_disclosing_remote_text(self):
        self.write(payload())
        worker = delivery.Delivery(self.sftp_env())
        with patch.object(delivery.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, stderr="untrusted remote reply")):
            self.assertFalse(worker.once(NOW))
            self.assertNotIn("untrusted", worker.status()["lastError"])
        with patch.object(delivery.subprocess, "run", side_effect=subprocess.TimeoutExpired([], 45)):
            self.assertFalse(worker.once(NOW))
        with patch.object(delivery.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)):
            self.assertTrue(worker.once(NOW))

    @unittest.skipUnless(Path("/usr/libexec/sftp-server").is_file() or Path("/usr/lib/openssh/sftp-server").is_file(), "local OpenSSH SFTP server not installed")
    def test_real_openssh_sftp_batch_replaces_existing_json(self):
        # SSH認証は別途実環境で確認します。ここでは実SFTPプロトコルの転送・renameを検証。
        remote = self.root / "remote"
        remote.mkdir()
        final = remote / "public-availability.json"
        final.write_bytes(b"previous")
        env = {**self.sftp_env(), "KPTC_AVAILABILITY_SFTP_DIRECTORY": str(remote)}
        worker = delivery.Delivery(env)
        self.write(payload())
        server = "/usr/libexec/sftp-server" if Path("/usr/libexec/sftp-server").is_file() else "/usr/lib/openssh/sftp-server"
        original_run = subprocess.run
        def local_sftp(_command, **kwargs):
            return original_run(["sftp", "-D", server, "-b", "-"], **kwargs)
        with patch.object(delivery.subprocess, "run", side_effect=local_sftp):
            self.assertTrue(worker.once(NOW))
        self.assertEqual(json.loads(final.read_bytes()), payload())
        self.assertEqual(final.stat().st_mode & 0o777, 0o644)
        self.assertFalse((remote / ".public-availability.json.upload").exists())

    def test_sftp_configuration_injection_and_excessive_key_permissions_rejected(self):
        env = self.sftp_env()
        for key, value in [("KPTC_AVAILABILITY_SFTP_HOST", "-oProxyCommand=bad"), ("KPTC_AVAILABILITY_SFTP_DIRECTORY", "/data\nrm /other"), ("KPTC_AVAILABILITY_SFTP_USER", "root")]:
            with self.assertRaises(ValueError):
                delivery.Delivery({**env, key: value})
        self.write(payload())
        Path(env["KPTC_AVAILABILITY_SFTP_KEY"]).chmod(0o644)
        self.assertFalse(delivery.Delivery(env).once(NOW))

    def test_php_export_to_local_delivery_does_not_expose_schedule_details(self):
        # 実際のPHP集計コードを通したJSONを、そのまま配信担当へ渡します。
        source = ROOT / "origin/shared/public/availability-json.php"
        code = 'require $argv[1]; $state=["members"=>[["id"=>"m6","name"=>"電波暗室","group"=>"試験室"],["id"=>"m7","name"=>"電材室","group"=>"試験室"],["id"=>"m8","name"=>"電子情報研究室","group"=>"試験室"]],"schedules"=>[["memberId"=>"m6","date"=>date("Y-m-d"),"endDate"=>date("Y-m-d"),"start"=>"09:00","end"=>"17:00","category"=>"機器利用","title"=>"PRIVATE-SCHEDULE","memo"=>"PRIVATE-MEMO"]]]; kptc_store_public_availability(kptc_build_public_availability($state,42));'
        result = subprocess.run(["php", "-r", code, str(source)], env={**os.environ, "KPTC_PUBLIC_AVAILABILITY_JSON": str(self.source)}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        raw = self.source.read_bytes()
        self.assertNotIn(b"PRIVATE-SCHEDULE", raw)
        self.assertNotIn(b"PRIVATE-MEMO", raw)
        self.assertTrue(delivery.Delivery(self.env).once())
        self.assertEqual(json.loads(self.output.read_bytes())["sourceVersion"], 42)
        # 共有レンタルサーバー向けPHPアダプターも、同じ集計結果だけを配信します。
        adapter = ROOT / "publisher/delivery-local-cli.php"
        contract = ROOT / "origin/shared/public/availability-contract.php"
        result = subprocess.run(["php", str(adapter), str(contract)], env={**os.environ, **self.env}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        good = self.output.read_bytes()
        self.source.write_text(json.dumps({**json.loads(raw), "schedules": [{"title": "PRIVATE"}]}))
        result = subprocess.run(["php", str(adapter), str(contract)], env={**os.environ, **self.env}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(self.output.read_bytes(), good)


if __name__ == "__main__":
    unittest.main()

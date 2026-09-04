<?php
declare(strict_types=1);

/* 非公開の最新1世代JSONバックアップと、新しいDBへの復元に共通する処理です。 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/auth.php';

function kptc_backup_json(array $value): string {
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}
function kptc_backup_assert(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
function kptc_backup_date(mixed $value): bool {
    if (!is_string($value) || !preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D', $value, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}
function kptc_backup_validate_state(array $state): void {
    foreach (['members','categories','schedules'] as $key) {
        kptc_backup_assert(isset($state[$key]) && is_array($state[$key]) && array_is_list($state[$key]), '予定データの一覧形式が不正です');
    }
    kptc_backup_assert(count($state['members']) > 0 && count($state['categories']) > 0, 'ユーザーまたは予定種別が空です');
    $members = [];
    foreach (['members','categories','schedules'] as $kind) {
        $ids = [];
        foreach ($state[$kind] as $item) {
            kptc_backup_assert(is_array($item) && is_string($item['id'] ?? null) && $item['id'] !== '' && !isset($ids[$item['id']]), 'IDの欠落または重複があります');
            $ids[$item['id']] = true;
            $required = $kind === 'members' ? ['name','group','initials','color'] : ($kind === 'categories' ? ['name','color'] : ['memberId','date','start','end','title','category']);
            foreach ($required as $field) kptc_backup_assert(is_string($item[$field] ?? null), '必須項目が欠落しています');
            if ($kind === 'members') $members[$item['id']] = true;
            if ($kind === 'schedules') {
                $endDate = $item['endDate'] ?? $item['date'];
                kptc_backup_assert(kptc_backup_date($item['date']) && kptc_backup_date($endDate) && $endDate >= $item['date'], '予定の日付が不正です');
                foreach (['start','end'] as $field) kptc_backup_assert(preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D', $item[$field]) === 1, '予定の時刻が不正です');
                kptc_backup_assert(isset($members[$item['memberId']]), '予定の所属ユーザーが存在しません');
                if (isset($item['private'])) kptc_backup_assert(is_bool($item['private']), '非公開設定が不正です');
                if (isset($item['memo'])) kptc_backup_assert(is_string($item['memo']), '予定メモが不正です');
            }
        }
    }
}
function kptc_backup_validate(array $payload): void {
    kptc_backup_assert(($payload['schemaVersion'] ?? null) === 1 && ($payload['kind'] ?? '') === 'kptc-scheduler-future', '対応しないバックアップ形式です');
    kptc_backup_assert(kptc_backup_date($payload['fromDate'] ?? null) && is_string($payload['createdAt'] ?? null), 'バックアップ日時が不正です');
    kptc_backup_assert(is_int($payload['sourceVersion'] ?? null) && $payload['sourceVersion'] > 0, 'データ世代が不正です');
    kptc_backup_assert(is_array($payload['state'] ?? null), '予定データがありません');
    kptc_backup_validate_state($payload['state']);
    foreach ($payload['state']['schedules'] as $schedule) kptc_backup_assert(($schedule['endDate'] ?? $schedule['date']) >= $payload['fromDate'], '対象外の過去予定が含まれています');
    $accounts = $payload['authAccounts'] ?? null;
    kptc_backup_assert(is_array($accounts) && array_is_list($accounts), 'アカウント情報が不正です');
    $memberIds = array_column($payload['state']['members'], 'id');
    $ids = []; $names = [];
    foreach ($accounts as $account) {
        kptc_backup_assert(is_array($account), 'アカウント形式が不正です');
        foreach (['id','enabled','auth_revision'] as $key) kptc_backup_assert(is_int($account[$key] ?? null), 'アカウント数値が不正です');
        foreach (['username','member_id','password_hash','role','created_at','updated_at'] as $key) kptc_backup_assert(is_string($account[$key] ?? null), 'アカウント項目が不正です');
        kptc_backup_assert($account['id'] > 0 && $account['auth_revision'] > 0 && in_array($account['enabled'], [0,1], true) && in_array($account['role'], ['user','admin','room'], true), 'アカウント属性が不正です');
        kptc_backup_assert(in_array($account['member_id'], $memberIds, true), 'アカウントに対応するユーザーがいません');
        $name = strtolower($account['username']);
        kptc_backup_assert($name !== '' && !isset($ids[$account['id']]) && !isset($names[$name]), 'アカウントIDが重複しています');
        $ids[$account['id']] = true; $names[$name] = true;
    }
    kptc_backup_assert(array_key_exists('adminPasswordHash', $payload), '管理者設定がありません');
    $hash = $payload['adminPasswordHash'];
    kptc_backup_assert($hash === null || (is_string($hash) && (password_get_info($hash)['algoName'] ?? 'unknown') !== 'unknown'), '管理者パスワード設定が不正です');
}

function kptc_backup_read(string $path): array {
    $raw = file_get_contents($path);
    kptc_backup_assert(is_string($raw), 'バックアップを読み込めません');
    $envelope = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    kptc_backup_assert(is_array($envelope) && is_array($envelope['payload'] ?? null) && is_string($envelope['sha256'] ?? null), 'バックアップ形式が不正です');
    kptc_backup_assert(hash_equals(hash('sha256', kptc_backup_json($envelope['payload'])), $envelope['sha256']), 'バックアップの整合性確認に失敗しました');
    kptc_backup_validate($envelope['payload']);
    return $envelope['payload'];
}

function kptc_backup_snapshot(string $database, string $today): array {
    kptc_backup_assert(is_file($database) && kptc_backup_date($today), 'DBまたは基準日が不正です');
    $db = new SQLite3($database, SQLITE3_OPEN_READONLY);
    $db->enableExceptions(true); $db->busyTimeout(10000);
    try {
        // 同じ読み取りトランザクションから取得し、途中の予定編集で整合性が崩れないようにします。
        $db->exec('BEGIN');
        kptc_backup_assert($db->querySingle('PRAGMA integrity_check') === 'ok', '元DBの整合性確認に失敗しました');
        $row = $db->querySingle('SELECT payload,version FROM app_state WHERE id=1', true);
        kptc_backup_assert(is_array($row) && isset($row['payload']), '元DBに予定データがありません');
        $state = json_decode($row['payload'], true, 64, JSON_THROW_ON_ERROR);
        kptc_backup_assert(is_array($state), '元DBの予定形式が不正です');
        kptc_backup_validate_state($state);
        $accounts = []; $result = $db->query('SELECT id,username,member_id,password_hash,role,enabled,auth_revision,created_at,updated_at,last_login_at FROM auth_users ORDER BY id');
        while ($account = $result->fetchArray(SQLITE3_ASSOC)) $accounts[] = $account;
        $hash = $db->querySingle("SELECT value FROM app_meta WHERE key='admin_mode_password_hash'");
        $db->exec('COMMIT');
        $payload = [
            'schemaVersion'=>1, 'kind'=>'kptc-scheduler-future',
            'createdAt'=>(new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format(DATE_ATOM),
            'fromDate'=>$today, 'sourceVersion'=>(int)$row['version'],
            'state'=>['members'=>$state['members'], 'categories'=>$state['categories'],
                'schedules'=>array_values(array_filter($state['schedules'], static fn($s) => ($s['endDate'] ?? $s['date']) >= $today))],
            'authAccounts'=>$accounts, 'adminPasswordHash'=>$hash,
        ];
        kptc_backup_validate($payload);
        return $payload;
    } finally { $db->close(); }
}

function kptc_backup_build_database(array $payload, string $path): void {
    kptc_backup_validate($payload);
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('PRAGMA journal_mode=DELETE');
    $pdo->beginTransaction();
    $pdo->exec('CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0)');
    $pdo->exec('CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    kptc_auth_create_tables($pdo);
    $pdo->prepare('INSERT INTO app_state VALUES(1,?,?,?)')->execute([kptc_backup_json($payload['state']), $payload['sourceVersion'], $payload['createdAt']]);
    $insert = $pdo->prepare('INSERT INTO auth_users(id,username,member_id,password_hash,role,enabled,auth_revision,created_at,updated_at,last_login_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
    foreach ($payload['authAccounts'] as $a) $insert->execute([$a['id'],$a['username'],$a['member_id'],$a['password_hash'],$a['role'],$a['enabled'],$a['auth_revision'],$a['created_at'],$a['updated_at'],$a['last_login_at'] ?? null]);
    $meta = $pdo->prepare('INSERT INTO app_meta VALUES(?,?)');
    // 復元直後にデモ予定や旧形式への移行を再実行しないよう、完了印を設定します。
    foreach (['room_demo_v1','remove_presence_fields_v2','organization_categories_extension_v1','remove_repeat_reminder_v1','public_availability_pending'] as $flag) $meta->execute([$flag,'1']);
    if ($payload['adminPasswordHash'] !== null) $meta->execute(['admin_mode_password_hash',$payload['adminPasswordHash']]);
    $pdo->commit();
    kptc_backup_assert($pdo->query('PRAGMA integrity_check')->fetchColumn() === 'ok', '復元DBの整合性確認に失敗しました');
    kptc_backup_assert($pdo->query('SELECT payload FROM app_state WHERE id=1')->fetchColumn() === kptc_backup_json($payload['state']), '復元結果が元データと一致しません');
    $pdo = null;
}

function kptc_backup_private_directory(string $path): string {
    $directory = dirname($path);
    if (!is_dir($directory)) kptc_backup_assert(mkdir($directory, 0700, true), '保存フォルダを作成できません');
    $real = realpath($directory);
    kptc_backup_assert(is_string($real) && $real !== '/', '保存先が不正です');
    $documentRoot = trim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
    foreach ([realpath(__DIR__), $documentRoot === '' ? false : realpath($documentRoot)] as $web) {
        if (is_string($web) && $web !== '' && $web !== '/') kptc_backup_assert($real !== $web && !str_starts_with($real . '/', $web . '/'), 'Web公開領域には保存できません');
    }
    kptc_backup_assert(!is_link($path), 'シンボリックリンクは保存先に使えません');
    return $real;
}

function kptc_backup_run(string $database, string $destination, ?string $today = null): array {
    umask(0077);
    kptc_backup_assert(str_ends_with($destination, '.json'), '保存先はJSONファイルにしてください');
    $directory = kptc_backup_private_directory($destination);
    kptc_backup_assert(!is_link($destination . '.lock'), 'ロックファイルが不正です');
    $lock = fopen($destination . '.lock', 'c');
    kptc_backup_assert($lock !== false, 'ロックを開けません');
    $temporary = null; $trial = null;
    try {
        kptc_backup_assert(flock($lock, LOCK_EX | LOCK_NB), 'バックアップは既に実行中です');
        $today ??= (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d');
        $payload = kptc_backup_snapshot($database, $today);
        $json = kptc_backup_json(['payload'=>$payload,'sha256'=>hash('sha256', kptc_backup_json($payload))]) . "\n";
        $temporary = tempnam($directory, '.backup-');
        kptc_backup_assert(is_string($temporary), '一時ファイルを作成できません');
        kptc_backup_assert(file_put_contents($temporary, $json) === strlen($json), 'バックアップの書き込みに失敗しました');
        $handle = fopen($temporary, 'r+');
        if ($handle !== false) { if (function_exists('fsync')) kptc_backup_assert(fsync($handle), 'バックアップを確定できません'); fclose($handle); }
        $verified = kptc_backup_read($temporary);
        // 毎回、別の一時SQLiteへ復元試験してから最新版を置換します。
        $trial = tempnam($directory, '.restore-check-');
        kptc_backup_assert(is_string($trial), '復元試験ファイルを作成できません');
        kptc_backup_build_database($verified, $trial);
        unlink($trial); $trial = null;
        kptc_backup_assert(rename($temporary, $destination), 'バックアップの置換に失敗しました');
        $temporary = null;
        return ['ok'=>true,'createdAt'=>$payload['createdAt'],'fromDate'=>$today,'schedules'=>count($payload['state']['schedules']),'bytes'=>strlen($json)];
    } finally {
        foreach ([$temporary,$trial] as $file) if (is_string($file)) { if (is_file($file)) unlink($file); if (is_file($file . '-journal')) unlink($file . '-journal'); }
        flock($lock, LOCK_UN); fclose($lock);
    }
}

function kptc_backup_restore(string $backup, string $destination): void {
    umask(0077);
    kptc_backup_assert(!file_exists($destination) && !is_link($destination), '復元先は未使用の新しいファイル名にしてください');
    $payload = kptc_backup_read($backup);
    $directory = kptc_backup_private_directory($destination);
    $temporary = tempnam($directory, '.restore-');
    kptc_backup_assert(is_string($temporary), '復元用ファイルを作成できません');
    try {
        kptc_backup_build_database($payload, $temporary);
        // linkは既存ファイルを上書きしないため、同時操作があっても本番DBを壊しません。
        kptc_backup_assert(link($temporary, $destination), '復元先を作成できません（既存DBは上書きしません）');
    } finally {
        if (is_file($temporary)) unlink($temporary);
        if (is_file($temporary . '-journal')) unlink($temporary . '-journal');
    }
}

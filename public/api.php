<?php
declare(strict_types=1);

require_once __DIR__ . '/runtime-config.php';
kptc_load_runtime_config('internal');
require_once __DIR__ . '/availability-publisher.php';
require_once __DIR__ . '/auth.php';

/*
 * 内部Linuxサーバー上で動作する共有APIです。
 * PHPセッションで利用者を識別し、SQLiteへ予定・ユーザー・予定種別・操作履歴を保存します。
 */

// API応答をJSONに統一し、共有データをブラウザや中継キャッシュへ残さないようにします。
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$scriptDirectory = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
$cookiePath = trim((string)(getenv('KPTC_SESSION_COOKIE_PATH') ?: '')) ?: ($scriptDirectory === '' || $scriptDirectory === '.' ? '/' : $scriptDirectory . '/');
$cookieSecureSetting = getenv('KPTC_SESSION_COOKIE_SECURE');
$cookieSecure = $cookieSecureSetting === false ? !empty($_SERVER['HTTPS']) : $cookieSecureSetting === '1';
session_name('KPTC_SCHEDULER_SESSION');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => $cookiePath,
    'secure' => $cookieSecure,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

function respond(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 2 * 1024 * 1024) respond(['error'=>'送信データが大きすぎます'], 413);
    try {
        $decoded = json_decode(file_get_contents('php://input') ?: '{}', true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        respond(['error'=>'JSONの形式が不正です'], 400);
    }
    return is_array($decoded) ? $decoded : [];
}

function initial_state(): array {
    // DBを初めて作成したときだけ使用する、画面確認用の初期データです。
    return [
        'members' => [
            ['id'=>'m1','name'=>'佐藤 美咲','group'=>'電気通信係','initials'=>'佐','color'=>'#e96f51','extension'=>'03-1234-5678'],
            ['id'=>'m2','name'=>'鈴木 健太','group'=>'電気通信係','initials'=>'鈴','color'=>'#3c82c8','extension'=>'03-1234-5681'],
            ['id'=>'m3','name'=>'高橋 直子','group'=>'電気通信係','initials'=>'高','color'=>'#8a67c8','extension'=>'03-1234-5686'],
            ['id'=>'m4','name'=>'田中 悠真','group'=>'電気通信係','initials'=>'田','color'=>'#268b7d','extension'=>'03-1234-5688'],
            ['id'=>'m5','name'=>'伊藤 由紀','group'=>'電気通信係','initials'=>'伊','color'=>'#d18b2f','extension'=>'03-1234-5692'],
            ['id'=>'m6','name'=>'電波暗室','group'=>'試験室','initials'=>'電波','color'=>'#536f91','extension'=>'03-1234-5701'],
            ['id'=>'m7','name'=>'電材室','group'=>'試験室','initials'=>'電材','color'=>'#417e72','extension'=>'03-1234-5702'],
            ['id'=>'m8','name'=>'電子情報研究室','group'=>'試験室','initials'=>'電子','color'=>'#765f9a','extension'=>'03-1234-5703'],
        ],
        'categories' => [
            ['id'=>'cat-vacation','name'=>'休暇','color'=>'#9a83c8'],
            ['id'=>'cat-maintenance','name'=>'機器点検','color'=>'#687783'],
            ['id'=>'cat-equipment-use','name'=>'機器利用','color'=>'#209885'],
            ['id'=>'cat-waiting','name'=>'キャンセル待ち','color'=>'#d09839'],
            ['id'=>'cat-internal-meeting','name'=>'所内会議','color'=>'#5086bd'],
            ['id'=>'cat-outside','name'=>'出張・外出','color'=>'#e87556'],
            ['id'=>'cat-other','name'=>'その他','color'=>'#718096'],
        ],
        'schedules' => [
            ['id'=>'s1','memberId'=>'m1','date'=>'2026-07-20','endDate'=>'2026-07-20','start'=>'09:30','end'=>'10:30','title'=>'営業定例','category'=>'所内会議','memo'=>'週次の案件レビュー'],
            ['id'=>'s2','memberId'=>'m1','date'=>'2026-07-21','endDate'=>'2026-07-21','start'=>'13:00','end'=>'15:00','title'=>'山田商事 訪問','category'=>'出張・外出'],
            ['id'=>'s3','memberId'=>'m1','date'=>'2026-07-23','endDate'=>'2026-07-23','start'=>'11:00','end'=>'12:00','title'=>'提案書レビュー','category'=>'その他'],
            ['id'=>'s4','memberId'=>'m2','date'=>'2026-07-20','endDate'=>'2026-07-20','start'=>'10:00','end'=>'11:00','title'=>'新規案件MTG','category'=>'所内会議'],
            ['id'=>'s5','memberId'=>'m2','date'=>'2026-07-22','endDate'=>'2026-07-22','start'=>'14:30','end'=>'16:30','title'=>'江東物流 訪問','category'=>'出張・外出','memo'=>'見積書を持参'],
            ['id'=>'s6','memberId'=>'m2','date'=>'2026-07-24','endDate'=>'2026-07-24','start'=>'09:00','end'=>'11:30','title'=>'月次レポート','category'=>'その他'],
            ['id'=>'s7','memberId'=>'m3','date'=>'2026-07-20','endDate'=>'2026-07-20','start'=>'13:00','end'=>'14:00','title'=>'開発スプリント計画','category'=>'所内会議'],
            ['id'=>'s8','memberId'=>'m3','date'=>'2026-07-21','endDate'=>'2026-07-21','start'=>'10:00','end'=>'12:00','title'=>'API設計','category'=>'その他','memo'=>'認証方式を確定'],
            ['id'=>'s9','memberId'=>'m3','date'=>'2026-07-23','endDate'=>'2026-07-23','start'=>'15:00','end'=>'16:00','title'=>'リリース判定','category'=>'所内会議','private'=>true],
            ['id'=>'s10','memberId'=>'m4','date'=>'2026-07-21','endDate'=>'2026-07-21','start'=>'09:30','end'=>'11:30','title'=>'画面実装','category'=>'その他'],
            ['id'=>'s11','memberId'=>'m4','date'=>'2026-07-22','endDate'=>'2026-07-22','start'=>'13:30','end'=>'14:30','title'=>'コードレビュー','category'=>'所内会議'],
            ['id'=>'s12','memberId'=>'m4','date'=>'2026-07-24','endDate'=>'2026-07-24','start'=>'10:00','end'=>'12:00','title'=>'データ移行検証','category'=>'その他'],
            ['id'=>'s13','memberId'=>'m5','date'=>'2026-07-21','endDate'=>'2026-07-21','start'=>'09:00','end'=>'18:00','title'=>'有給休暇','category'=>'休暇','private'=>true],
            ['id'=>'s14','memberId'=>'m5','date'=>'2026-07-23','endDate'=>'2026-07-23','start'=>'10:00','end'=>'11:00','title'=>'採用面談','category'=>'所内会議'],
        ],
    ];
}

function room_demo_schedules(): array {
    // 試験室の空き状況表示を確認するための予約・メンテナンス例です。
    return [
        ['id'=>'room-demo-m6-july','memberId'=>'m6','date'=>'2026-07-01','endDate'=>'2026-07-01','start'=>'00:00','end'=>'23:59','timePreset'=>'all-day','title'=>'電波暗室 予約済み','category'=>'機器利用'],
        ['id'=>'room-demo-m7-1','memberId'=>'m7','date'=>'2026-07-27','start'=>'09:00','end'=>'12:00','timePreset'=>'morning','title'=>'材料評価','category'=>'機器利用'],
        ['id'=>'room-demo-m7-2','memberId'=>'m7','date'=>'2026-07-28','start'=>'13:00','end'=>'17:00','timePreset'=>'afternoon','title'=>'耐久試験','category'=>'機器利用'],
        ['id'=>'room-demo-m7-3','memberId'=>'m7','date'=>'2026-07-29','start'=>'09:00','end'=>'17:00','title'=>'終日試験','category'=>'機器利用'],
        ['id'=>'room-demo-m7-4','memberId'=>'m7','date'=>'2026-07-30','start'=>'09:00','end'=>'17:00','title'=>'設備点検','category'=>'機器点検'],
        ['id'=>'room-demo-m7-5','memberId'=>'m7','date'=>'2026-08-05','start'=>'09:00','end'=>'12:00','timePreset'=>'morning','title'=>'部材試験','category'=>'機器利用'],
        ['id'=>'room-demo-m7-6','memberId'=>'m7','date'=>'2026-08-12','start'=>'09:00','end'=>'17:00','title'=>'定期メンテナンス','category'=>'機器点検'],
        ['id'=>'room-demo-m8-1','memberId'=>'m8','date'=>'2026-07-27','start'=>'13:00','end'=>'17:00','timePreset'=>'afternoon','title'=>'通信評価','category'=>'機器利用'],
        ['id'=>'room-demo-m8-2','memberId'=>'m8','date'=>'2026-08-03','start'=>'09:00','end'=>'17:00','title'=>'情報機器試験','category'=>'機器利用'],
        ['id'=>'room-demo-m8-3','memberId'=>'m8','date'=>'2026-08-18','start'=>'09:00','end'=>'17:00','title'=>'設備校正','category'=>'機器点検'],
        ['id'=>'room-demo-m8-4','memberId'=>'m8','date'=>'2026-09-07','start'=>'09:00','end'=>'12:00','timePreset'=>'morning','title'=>'EMC事前評価','category'=>'機器利用'],
        ['id'=>'room-demo-m8-5','memberId'=>'m8','date'=>'2026-09-15','start'=>'13:00','end'=>'17:00','timePreset'=>'afternoon','title'=>'電子情報評価','category'=>'機器利用'],
    ];
}

function standard_categories(): array {
    // 運用で使用する予定種別を、画面と同じ順序・配色で返します。
    return [
        ['id'=>'cat-vacation','name'=>'休暇','color'=>'#9a83c8'],
        ['id'=>'cat-maintenance','name'=>'機器点検','color'=>'#687783'],
        ['id'=>'cat-equipment-use','name'=>'機器利用','color'=>'#209885'],
        ['id'=>'cat-waiting','name'=>'キャンセル待ち','color'=>'#d09839'],
        ['id'=>'cat-internal-meeting','name'=>'所内会議','color'=>'#5086bd'],
        ['id'=>'cat-outside','name'=>'出張・外出','color'=>'#e87556'],
        ['id'=>'cat-other','name'=>'その他','color'=>'#718096'],
    ];
}

function uses_legacy_organization_categories(array $state): bool {
    // 移行後に追加された独自予定種別は保護し、旧形式の履歴だけを再変換します。
    foreach ($state['members'] ?? [] as $member) {
        if (isset($member['phone']) || isset($member['email'])) return true;
        if (!in_array(($member['group'] ?? ''), ['電気通信係', '試験室'], true)) return true;
    }
    foreach ($state['schedules'] ?? [] as $schedule) {
        if (in_array(($schedule['category'] ?? ''), ['会議', '訪問', '作業'], true)) return true;
    }
    return false;
}

function migrate_organization_categories(array $state): array {
    // 既存の利用者・予定を保持したまま、所属、内線、予定種別を新しい体系へ変換します。
    $roomMemberIds = [];
    if (isset($state['members']) && is_array($state['members'])) {
        foreach ($state['members'] as $member) {
            if (($member['group'] ?? '') === '試験室') $roomMemberIds[(string)($member['id'] ?? '')] = true;
        }
        foreach ($state['members'] as &$member) {
            $member['group'] = ($member['group'] ?? '') === '試験室' ? '試験室' : '電気通信係';
            $member['extension'] = (string)($member['extension'] ?? $member['phone'] ?? '');
            unset($member['phone'], $member['email']);
        }
        unset($member);
    }

    $state['categories'] = standard_categories();
    $allowed = array_fill_keys(array_column($state['categories'], 'name'), true);
    if (isset($state['schedules']) && is_array($state['schedules'])) {
        foreach ($state['schedules'] as &$schedule) {
            $category = (string)($schedule['category'] ?? 'その他');
            if (isset($allowed[$category])) continue;
            $isRoom = isset($roomMemberIds[(string)($schedule['memberId'] ?? '')]);
            if ($category === '会議') $schedule['category'] = $isRoom ? '機器利用' : '所内会議';
            elseif ($category === '作業') $schedule['category'] = $isRoom ? '機器点検' : 'その他';
            elseif ($category === '訪問') $schedule['category'] = '出張・外出';
            elseif ($category === '休暇') $schedule['category'] = '休暇';
            else $schedule['category'] = 'その他';
        }
        unset($schedule);
    }
    return $state;
}

function strip_schedule_automation_fields(array $state): array {
    // 廃止した繰り返し・リマインダー設定だけを除き、予定本体と複数日の期間は保持します。
    if (isset($state['schedules']) && is_array($state['schedules'])) {
        foreach ($state['schedules'] as &$schedule) unset($schedule['repeat'], $schedule['repeatUntil'], $schedule['reminderMinutes']);
        unset($schedule);
    }
    return $state;
}

function mark_availability_publish_pending(PDO $pdo): void {
    // 内部DBの更新と同じ取引で未送信印を付け、外部サーバーへの連携失敗を再試行できるようにします。
    $pdo->prepare("INSERT OR REPLACE INTO app_meta(key,value) VALUES('public_availability_pending','1')")->execute();
}

function set_meta(PDO $pdo, string $key, string $value): void {
    $pdo->prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)')->execute([$key, $value]);
}

function get_meta(PDO $pdo, string $key): ?string {
    $statement = $pdo->prepare('SELECT value FROM app_meta WHERE key=?');
    $statement->execute([$key]);
    $value = $statement->fetchColumn();
    return $value === false ? null : (string)$value;
}

function attempt_availability_publish(PDO $pdo, array $state, int $sourceVersion): bool {
    // 公開情報の連携失敗は予定保存を巻き戻さず、内部DBに再送待ちとして記録します。
    set_meta($pdo, 'public_availability_last_attempt_at', date(DATE_ATOM));
    set_meta($pdo, 'public_availability_source_version', (string)$sourceVersion);
    try {
        $published = kptc_publish_availability($state, $sourceVersion);
        set_meta($pdo, 'public_availability_pending', '0');
        set_meta($pdo, 'public_availability_updated_at', (string)$published['updatedAt']);
        set_meta($pdo, 'public_availability_last_success_at', date(DATE_ATOM));
        set_meta($pdo, 'public_availability_last_error', '');
        set_meta($pdo, 'public_availability_consecutive_failures', '0');
        return true;
    } catch (Throwable $error) {
        mark_availability_publish_pending($pdo);
        $failureCount = (int)(get_meta($pdo, 'public_availability_consecutive_failures') ?? '0') + 1;
        set_meta($pdo, 'public_availability_consecutive_failures', (string)$failureCount);
        set_meta($pdo, 'public_availability_last_error', substr($error->getMessage(), 0, 500));
        error_log('Public availability publish failed: ' . $error->getMessage());
        return false;
    }
}

function db(): PDO {
    // Web公開フォルダの外側へSQLiteを置き、WALモードで同時アクセスを扱います。
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $configuredPath = trim((string)(getenv('KPTC_INTERNAL_SCHEDULER_DB') ?: ''));
    $databasePath = $configuredPath !== '' ? $configuredPath : dirname(__DIR__, 2) . '/GW/group-watcher.sqlite';
    $dataDir = dirname($databasePath);
    if (!is_dir($dataDir)) mkdir($dataDir, 0700, true);
    $pdo = new PDO('sqlite:' . $databasePath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    kptc_auth_create_tables($pdo);
    $count = (int)$pdo->query('SELECT COUNT(*) FROM app_state')->fetchColumn();
    if ($count === 0) {
        // アプリ状態は1行にまとめ、version列を楽観ロックへ利用します。
        $stmt = $pdo->prepare('INSERT INTO app_state(id,payload,version,updated_at) VALUES(1,?,1,?)');
        $stmt->execute([json_encode(initial_state(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), date(DATE_ATOM)]);
    }
    $seeded = $pdo->query("SELECT value FROM app_meta WHERE key='room_demo_v1'")->fetchColumn();
    if ($seeded === false) {
        // 既存利用者へも試験室デモ予定を一度だけ追加します。
        $row = $pdo->query('SELECT payload,version FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
        $state = json_decode($row['payload'], true);
        $known = array_column($state['schedules'] ?? [], 'id');
        foreach (room_demo_schedules() as $schedule) {
            if (!in_array($schedule['id'], $known, true)) $state['schedules'][] = $schedule;
        }
        $stmt = $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1');
        $stmt->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (int)$row['version'] + 1, date(DATE_ATOM)]);
        $pdo->prepare("INSERT INTO app_meta(key,value) VALUES('room_demo_v1','1')")->execute();
    }
    $trimmed = $pdo->query("SELECT value FROM app_meta WHERE key='remove_presence_fields_v2'")->fetchColumn();
    if ($trimmed === false) {
        // 廃止した在席・行き先・メッセージのデータを既存DBから一度だけ除去します。
        $row = $pdo->query('SELECT payload,version FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
        $state = json_decode($row['payload'], true);
        unset($state['messages']);
        if (isset($state['members']) && is_array($state['members'])) {
            foreach ($state['members'] as &$member) {
                unset($member['presence'], $member['destination'], $member['returnAt']);
            }
            unset($member);
        }
        $stmt = $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1');
        $stmt->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (int)$row['version'] + 1, date(DATE_ATOM)]);
        $pdo->prepare("INSERT INTO app_meta(key,value) VALUES('remove_presence_fields_v2','1')")->execute();
    }
    $organizationMigrated = $pdo->query("SELECT value FROM app_meta WHERE key='organization_categories_extension_v1'")->fetchColumn();
    if ($organizationMigrated === false) {
        // 保存済みの件数や予定内容は変えず、今回変更した分類と連絡先項目だけを一度移行します。
        $row = $pdo->query('SELECT payload,version FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
        $state = migrate_organization_categories(json_decode($row['payload'], true));
        $stmt = $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1');
        $stmt->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (int)$row['version'] + 1, date(DATE_ATOM)]);
        $pdo->prepare("INSERT INTO app_meta(key,value) VALUES('organization_categories_extension_v1','1')")->execute();
    }
    $automationRemoved = $pdo->query("SELECT value FROM app_meta WHERE key='remove_repeat_reminder_v1'")->fetchColumn();
    if ($automationRemoved === false) {
        // 既存予定を消さず、廃止した繰り返し・リマインダーの設定項目だけを一度除去します。
        $row = $pdo->query('SELECT payload,version FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
        $state = json_decode($row['payload'], true);
        $cleaned = strip_schedule_automation_fields($state);
        if ($cleaned !== $state) {
            $stmt = $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1');
            $stmt->execute([json_encode($cleaned, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (int)$row['version'] + 1, date(DATE_ATOM)]);
            mark_availability_publish_pending($pdo);
        }
        $pdo->prepare("INSERT INTO app_meta(key,value) VALUES('remove_repeat_reminder_v1','1')")->execute();
    }
    $jsonPublished = $pdo->query("SELECT value FROM app_meta WHERE key='public_availability_json_v1'")->fetchColumn();
    $publishPending = $pdo->query("SELECT value FROM app_meta WHERE key='public_availability_pending'")->fetchColumn();
    $publishedRangeStart = $pdo->query("SELECT value FROM app_meta WHERE key='public_availability_range_start'")->fetchColumn();
    $currentRangeStart = (new DateTimeImmutable('first day of this month', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d');
    if ($jsonPublished === false || $publishPending === '1' || $publishedRangeStart !== $currentRangeStart) {
        // 初回、未送信、月替わりのいずれかで、公開用の3か月分JSONを上書き生成します。
        $row = $pdo->query('SELECT payload,version FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
        $state = json_decode($row['payload'], true);
        if (attempt_availability_publish($pdo, $state, (int)$row['version'])) {
            $meta = $pdo->prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)');
            $meta->execute(['public_availability_json_v1', '1']);
            $meta->execute(['public_availability_range_start', $currentRangeStart]);
        }
    }
    return $pdo;
}

function current_record(PDO $pdo): array {
    $row = $pdo->query('SELECT payload,version FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
    return ['state'=>json_decode($row['payload'], true), 'version'=>(int)$row['version']];
}

function audit_list(PDO $pdo): array {
    $rows = $pdo->query('SELECT id,actor_id,actor_name,action,summary,created_at,undone,before_json FROM audit_logs ORDER BY id DESC LIMIT 50')->fetchAll(PDO::FETCH_ASSOC);
    $historySeen = false;
    // 取り消し可能なのは、履歴上で最後に行われたデータ変更だけです。
    return array_map(function($row) use (&$historySeen) {
        $canUndo = false;
        if (!$historySeen && $row['before_json'] !== null) {
            $historySeen = true;
            $canUndo = (int)$row['undone'] === 0 && $row['action'] !== '取り消し';
        }
        return [
            'id'=>(int)$row['id'], 'actorId'=>$row['actor_id'], 'actorName'=>$row['actor_name'],
            'action'=>$row['action'], 'summary'=>$row['summary'], 'createdAt'=>$row['created_at'], 'canUndo'=>$canUndo,
        ];
    }, $rows);
}

function csrf(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
    return $_SESSION['csrf'];
}

function require_post(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') respond(['error'=>'POSTで送信してください'], 405);
}

function require_auth_user(): array {
    // 更新系APIはログイン済みセッションとCSRFトークンの両方を要求します。
    $user = kptc_auth_active_session_user(db());
    if ($user === null) {
        $_SESSION = [];
        respond(['error'=>'ログインが必要です'], 401);
    }
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($token === '' || !hash_equals(csrf(), $token)) respond(['error'=>'セッションを確認できません'], 403);
    return $user;
}

function require_auth(): string {
    return (string)require_auth_user()['member_id'];
}

function require_admin(): array {
    $user = require_auth_user();
    if (($user['role'] ?? '') !== 'admin') respond(['error'=>'管理者権限が必要です'], 403);
    return $user;
}

function require_schedule_editor(): array {
    $user = require_auth_user();
    if (!in_array((string)($user['role'] ?? ''), ['admin', 'user'], true)) respond(['error'=>'このアカウントは閲覧専用です'], 403);
    return $user;
}

function member_name(array $state, string $memberId): string {
    foreach ($state['members'] ?? [] as $member) if (($member['id'] ?? '') === $memberId) return (string)$member['name'];
    return '削除済みユーザー';
}

function public_availability_page_url(): string {
    // 配置先が変わっても再ビルドせず、内部サーバー設定だけで外部公開URLを切り替えられます。
    $url = trim((string)(getenv('KPTC_PUBLIC_AVAILABILITY_PAGE_URL') ?: ''));
    if ($url === '') return '';
    $scheme = strtolower((string)(parse_url($url, PHP_URL_SCHEME) ?: ''));
    return filter_var($url, FILTER_VALIDATE_URL) !== false && in_array($scheme, ['https', 'http'], true) ? $url : '';
}

function bootstrap_payload(PDO $pdo): array {
    $record = current_record($pdo);
    $user = kptc_auth_active_session_user($pdo);
    if ($user === null && !empty($_SESSION['auth_user_id'])) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $isGuest = ($user['role'] ?? '') === 'guest';
    $memberId = $user === null ? null : (string)$user['member_id'];
    if (!$isGuest && $memberId && member_name($record['state'], $memberId) === '削除済みユーザー') {
        $_SESSION = [];
        $memberId = null;
    }
    if ($memberId === null) return ['authenticated'=>false, 'setupRequired'=>kptc_auth_user_count($pdo) === 0, 'loginUsers'=>kptc_auth_login_user_list($pdo, $record['state'])];
    return $record + [
        'authenticated'=>true,
        'setupRequired'=>false,
        'currentUserId'=>$memberId,
        'username'=>(string)$user['username'],
        'role'=>(string)$user['role'],
        'csrfToken'=>csrf(),
        'publicAvailabilityPageUrl'=>public_availability_page_url(),
        'authAccounts'=>$user['role'] === 'admin' ? kptc_auth_account_list($pdo) : [],
        'audit'=>$user['role'] === 'admin' ? audit_list($pdo) : [],
        'availabilityPublish'=>[
            'pending'=>get_meta($pdo, 'public_availability_pending') === '1',
            'lastAttemptAt'=>get_meta($pdo, 'public_availability_last_attempt_at'),
            'lastSuccessAt'=>get_meta($pdo, 'public_availability_last_success_at'),
            'consecutiveFailures'=>(int)(get_meta($pdo, 'public_availability_consecutive_failures') ?? '0'),
        ],
    ];
}

$pdo = db();
$action = $_GET['action'] ?? 'bootstrap';

// 初期データ取得とログイン状態確認。
if ($action === 'bootstrap') respond(bootstrap_payload($pdo));

// ユーザー名とパスワードを検証し、固定攻撃を避けるためセッションIDを更新します。
if ($action === 'login') {
    require_post();
    $input = body();
    $username = (string)($input['username'] ?? '');
    $password = (string)($input['password'] ?? '');
    if (strlen($username) < 3 || strlen($username) > 64 || strlen($password) < 12 || strlen($password) > 256) respond(['error'=>'ユーザー名またはパスワードが正しくありません'], 401);
    if (kptc_auth_user_count($pdo) === 0) respond(['error'=>'管理者による初期アカウント設定が必要です', 'setupRequired'=>true], 503);
    try {
        $user = kptc_auth_verify($pdo, $username, $password, (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    } catch (OverflowException $error) {
        respond(['error'=>$error->getMessage()], 429);
    }
    if ($user === null) respond(['error'=>'ユーザー名またはパスワードが正しくありません'], 401);
    $memberId = (string)$user['member_id'];
    $record = current_record($pdo);
    $name = member_name($record['state'], $memberId);
    if ($memberId === '' || $name === '削除済みユーザー') respond(['error'=>'対応するスケジューラーユーザーが見つかりません'], 403);
    session_regenerate_id(true);
    unset($_SESSION['guest']);
    $_SESSION['auth_user_id'] = (int)$user['id'];
    $_SESSION['authenticated_at'] = time();
    $_SESSION['last_activity_at'] = time();
    $_SESSION['auth_revision'] = (int)$user['auth_revision'];
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    $stmt = $pdo->prepare('INSERT INTO audit_logs(actor_id,actor_name,action,summary,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)');
    $stmt->execute([$memberId,$name,'ログイン','ログイン',null,null,date(DATE_ATOM)]);
    respond(bootstrap_payload($pdo));
}

if ($action === 'guest-login') {
    // ゲストはパスワードなしで閲覧できますが、更新APIでは必ず拒否されます。
    require_post();
    session_regenerate_id(true);
    $_SESSION = [
        'guest'=>true,
        'authenticated_at'=>time(),
        'last_activity_at'=>time(),
        'csrf'=>bin2hex(random_bytes(24)),
    ];
    respond(bootstrap_payload($pdo));
}

if ($action === 'logout') {
    require_post();
    require_auth();
    $_SESSION = [];
    session_destroy();
    respond(['ok'=>true]);
}

if ($action === 'member-account') {
    // ユーザー情報とログイン情報を同じ取引で保存し、管理画面を一体化します。
    require_post();
    $admin = require_admin();
    $input = body();
    $operation = (string)($input['operation'] ?? 'save');
    $expectedVersion = (int)($input['version'] ?? 0);
    $memberInput = $input['member'] ?? null;
    if (!is_array($memberInput)) respond(['error'=>'ユーザー情報が不正です'], 422);
    $memberId = trim((string)($memberInput['id'] ?? ''));
    $username = kptc_auth_normalize_username((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');
    $role = (string)($input['role'] ?? 'user');
    try {
        if ($memberId === '' || !preg_match('/^[A-Za-z0-9._-]{1,80}$/', $memberId)) throw new InvalidArgumentException('ユーザーIDが不正です');
        if (!in_array($role, ['admin', 'user', 'room'], true)) throw new InvalidArgumentException('権限を選択してください');
        $pdo->beginTransaction();
        $record = current_record($pdo);
        if ($record['version'] !== $expectedVersion) {
            $pdo->rollBack();
            respond(bootstrap_payload($pdo) + ['error'=>'別の利用者による更新がありました'], 409);
        }
        $state = $record['state'];
        $memberIndex = null;
        foreach ($state['members'] as $index => $member) if (($member['id'] ?? '') === $memberId) { $memberIndex = $index; break; }
        $accountStatement = $pdo->prepare('SELECT id,username,member_id,role,enabled FROM auth_users WHERE member_id=?');
        $accountStatement->execute([$memberId]);
        $account = $accountStatement->fetch(PDO::FETCH_ASSOC);
        $actorName = member_name($state, (string)$admin['member_id']);
        $before = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $now = date(DATE_ATOM);
        $sessionRevision = null;

        if ($operation === 'delete') {
            if ($memberIndex === null) throw new InvalidArgumentException('削除するユーザーが見つかりません');
            if ($memberId === (string)$admin['member_id']) throw new InvalidArgumentException('ログイン中のユーザーは削除できません');
            array_splice($state['members'], $memberIndex, 1);
            $state['schedules'] = array_values(array_filter($state['schedules'], static fn(array $schedule): bool => ($schedule['memberId'] ?? '') !== $memberId));
            if (is_array($account)) $pdo->prepare('DELETE FROM auth_users WHERE id=?')->execute([(int)$account['id']]);
            $summary = member_name($record['state'], $memberId) . 'を削除';
            $actionName = 'ユーザー削除';
        } else {
            $name = trim((string)($memberInput['name'] ?? ''));
            $group = (string)($memberInput['group'] ?? '');
            $initials = trim((string)($memberInput['initials'] ?? ''));
            $color = (string)($memberInput['color'] ?? '');
            $extension = trim((string)($memberInput['extension'] ?? ''));
            if ($name === '' || mb_strlen($name) > 100) throw new InvalidArgumentException('氏名を入力してください');
            if (!in_array($group, ['電気通信係', '試験室'], true)) throw new InvalidArgumentException('所属が不正です');
            if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) throw new InvalidArgumentException('表示色が不正です');
            $member = ['id'=>$memberId, 'name'=>$name, 'group'=>$group, 'initials'=>mb_substr($initials !== '' ? $initials : $name, 0, 2), 'color'=>$color, 'extension'=>mb_substr($extension, 0, 100)];
            if ($memberIndex === null) $state['members'][] = $member; else $state['members'][$memberIndex] = $member;

            $withoutLogin = $role === 'room' && $username === '';
            if ($withoutLogin) {
                if (is_array($account)) {
                    if ((int)$account['id'] === (int)$admin['id']) throw new InvalidArgumentException('ログイン中の管理者アカウントは削除できません');
                    $pdo->prepare('DELETE FROM auth_users WHERE id=?')->execute([(int)$account['id']]);
                }
            } else {
                kptc_auth_validate_username($username);
                if (is_array($account) && $account['role'] === 'admin' && $role !== 'admin' && kptc_auth_enabled_admin_count($pdo) <= 1) throw new InvalidArgumentException('最後の管理者を変更できません');
                if (is_array($account)) {
                    if ($password !== '') {
                        $statement = $pdo->prepare('UPDATE auth_users SET username=?,role=?,password_hash=?,auth_revision=auth_revision+1,updated_at=? WHERE id=?');
                        $statement->execute([$username,$role,kptc_auth_password_hash($password),$now,(int)$account['id']]);
                    } else {
                        $statement = $pdo->prepare('UPDATE auth_users SET username=?,role=?,auth_revision=auth_revision+1,updated_at=? WHERE id=?');
                        $statement->execute([$username,$role,$now,(int)$account['id']]);
                    }
                    if ((int)$account['id'] === (int)$admin['id']) {
                        $revision = $pdo->prepare('SELECT auth_revision FROM auth_users WHERE id=?');
                        $revision->execute([(int)$account['id']]);
                        $sessionRevision = (int)$revision->fetchColumn();
                    }
                } else {
                    if ($password === '') throw new InvalidArgumentException('新しいアカウントのパスワードを入力してください');
                    $statement = $pdo->prepare('INSERT INTO auth_users(username,member_id,password_hash,role,enabled,auth_revision,created_at,updated_at) VALUES(?,?,?,?,1,1,?,?)');
                    $statement->execute([$username,$memberId,kptc_auth_password_hash($password),$role,$now,$now]);
                }
            }
            $summary = $name . ($memberIndex === null ? 'を追加' : 'を更新');
            $actionName = $memberIndex === null ? 'ユーザー追加' : 'ユーザー編集';
        }

        $after = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $nextVersion = $record['version'] + 1;
        $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1')->execute([$after,$nextVersion,$now]);
        $pdo->prepare('INSERT INTO audit_logs(actor_id,actor_name,action,summary,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)')->execute([(string)$admin['member_id'],$actorName,$actionName,$summary,$before,$after,$now]);
        mark_availability_publish_pending($pdo);
        $pdo->commit();
        if ($sessionRevision !== null) $_SESSION['auth_revision'] = $sessionRevision;
        attempt_availability_publish($pdo, $state, $nextVersion);
        respond(bootstrap_payload($pdo));
    } catch (InvalidArgumentException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respond(['error'=>$error->getMessage()], 422);
    } catch (PDOException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ((string)$error->getCode() === '23000') respond(['error'=>'このアカウントIDは既に使用されています'], 409);
        error_log('Member account update failed: ' . $error->getMessage());
        respond(['error'=>'ユーザー情報を保存できませんでした'], 500);
    }
}

if ($action === 'save') {
    // 受信時のversionが最新値と一致した場合だけ、状態と監査ログを同じ取引で更新します。
    require_post();
    $editor = require_schedule_editor();
    $actorId = (string)$editor['member_id'];
    $input = body();
    $state = $input['state'] ?? null;
    if (!is_array($state) || !isset($state['members'],$state['schedules'],$state['categories'])) respond(['error'=>'保存データが不正です'], 422);
    $state = strip_schedule_automation_fields($state);
    $nextMemberIds = array_column($state['members'], 'id');
    $linkedMemberIds = $pdo->query('SELECT member_id FROM auth_users')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($linkedMemberIds as $linkedMemberId) {
        if (!in_array($linkedMemberId, $nextMemberIds, true)) respond(bootstrap_payload($pdo) + ['error'=>'ログインアカウントがあるユーザーは削除できません'], 422);
    }
    $expectedVersion = (int)($input['version'] ?? 0);
    $pdo->beginTransaction();
    $record = current_record($pdo);
    if ($record['version'] !== $expectedVersion) {
        $pdo->rollBack();
        respond(bootstrap_payload($pdo) + ['error'=>'別の利用者による更新がありました'], 409);
    }
    if (($editor['role'] ?? '') !== 'admin' && ($state['members'] !== $record['state']['members'] || $state['categories'] !== $record['state']['categories'])) {
        $pdo->rollBack();
        respond(['error'=>'一般ユーザーはユーザー・予定種別を変更できません'], 403);
    }
    $before = json_encode($record['state'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $after = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $nextVersion = $record['version'] + 1;
    $stmt = $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1');
    $stmt->execute([$after,$nextVersion,date(DATE_ATOM)]);
    $name = member_name($state, $actorId);
    $log = $pdo->prepare('INSERT INTO audit_logs(actor_id,actor_name,action,summary,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)');
    $log->execute([$actorId,$name,(string)($input['action'] ?? '更新'),(string)($input['summary'] ?? 'データを更新'),$before,$after,date(DATE_ATOM)]);
    mark_availability_publish_pending($pdo);
    $pdo->commit();
    attempt_availability_publish($pdo, $state, $nextVersion);
    respond(bootstrap_payload($pdo));
}

if ($action === 'undo') {
    // 指定された監査ログのbefore_jsonを復元し、取り消し自体も新しい履歴として残します。
    require_post();
    $actor = require_admin();
    $actorId = (string)$actor['member_id'];
    $input = body();
    $auditId = (int)($input['auditId'] ?? 0);
    $expectedVersion = (int)($input['version'] ?? 0);
    $pdo->beginTransaction();
    $record = current_record($pdo);
    if ($record['version'] !== $expectedVersion) {
        $pdo->rollBack();
        respond(bootstrap_payload($pdo) + ['error'=>'別の利用者による更新がありました'], 409);
    }
    $stmt = $pdo->prepare('SELECT * FROM audit_logs WHERE id=? AND undone=0 AND before_json IS NOT NULL');
    $stmt->execute([$auditId]);
    $target = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$target) { $pdo->rollBack(); respond(['error'=>'取り消せない操作です'], 422); }
    // 旧体系の履歴を取り消した場合も、現在の所属・内線・予定種別へ正規化してから復元します。
    $restored = json_decode($target['before_json'], true);
    if (uses_legacy_organization_categories($restored)) $restored = migrate_organization_categories($restored);
    $restored = strip_schedule_automation_fields($restored);
    $restoredJson = json_encode($restored, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $nextVersion = $record['version'] + 1;
    $update = $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1');
    $update->execute([$restoredJson,$nextVersion,date(DATE_ATOM)]);
    $pdo->prepare('UPDATE audit_logs SET undone=1 WHERE id=?')->execute([$auditId]);
    $name = member_name($restored, $actorId);
    $log = $pdo->prepare('INSERT INTO audit_logs(actor_id,actor_name,action,summary,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)');
    $log->execute([$actorId,$name,'取り消し','「'.$target['summary'].'」を取り消し',json_encode($record['state'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),$restoredJson,date(DATE_ATOM)]);
    mark_availability_publish_pending($pdo);
    $pdo->commit();
    attempt_availability_publish($pdo, $restored, $nextVersion);
    respond(bootstrap_payload($pdo));
}

respond(['error'=>'不明な操作です'], 404);

<?php
declare(strict_types=1);

/*
 * さくらインターネット上で動作する共有APIです。
 * PHPセッションで利用者を識別し、SQLiteへ予定・在席・伝言・操作履歴を保存します。
 */

// API応答をJSONに統一し、共有データをブラウザや中継キャッシュへ残さないようにします。
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
session_name('GW_SESSION');
session_set_cookie_params([
    'lifetime' => 60 * 60 * 12,
    'path' => '/GW/',
    'secure' => !empty($_SERVER['HTTPS']),
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
    $decoded = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($decoded) ? $decoded : [];
}

function initial_state(): array {
    // DBを初めて作成したときだけ使用する、画面確認用の初期データです。
    return [
        'members' => [
            ['id'=>'m1','name'=>'佐藤 美咲','group'=>'営業部','initials'=>'佐','color'=>'#e96f51','presence'=>'外出','destination'=>'丸の内・山田商事','returnAt'=>'16:30','phone'=>'03-1234-5678','email'=>'misaki.sato@example.jp'],
            ['id'=>'m2','name'=>'鈴木 健太','group'=>'営業部','initials'=>'鈴','color'=>'#3c82c8','presence'=>'在席','destination'=>'本社 3F','phone'=>'03-1234-5681','email'=>'kenta.suzuki@example.jp'],
            ['id'=>'m3','name'=>'高橋 直子','group'=>'開発部','initials'=>'高','color'=>'#8a67c8','presence'=>'会議中','destination'=>'第2会議室','returnAt'=>'14:00','phone'=>'03-1234-5686','email'=>'naoko.takahashi@example.jp'],
            ['id'=>'m4','name'=>'田中 悠真','group'=>'開発部','initials'=>'田','color'=>'#268b7d','presence'=>'離席','destination'=>'休憩中','returnAt'=>'13:30','phone'=>'03-1234-5688','email'=>'yuma.tanaka@example.jp'],
            ['id'=>'m5','name'=>'伊藤 由紀','group'=>'管理部','initials'=>'伊','color'=>'#d18b2f','presence'=>'休暇','destination'=>'終日休暇','phone'=>'03-1234-5692','email'=>'yuki.ito@example.jp'],
            ['id'=>'m6','name'=>'電波暗室','group'=>'試験室','initials'=>'電波','color'=>'#536f91','presence'=>'在席','destination'=>'電波暗室','phone'=>'03-1234-5701','email'=>'anechoic@example.jp'],
            ['id'=>'m7','name'=>'電材室','group'=>'試験室','initials'=>'電材','color'=>'#417e72','presence'=>'在席','destination'=>'電材室','phone'=>'03-1234-5702','email'=>'materials@example.jp'],
            ['id'=>'m8','name'=>'電子情報研究室','group'=>'試験室','initials'=>'電子','color'=>'#765f9a','presence'=>'在席','destination'=>'電子情報研究室','phone'=>'03-1234-5703','email'=>'electronics@example.jp'],
        ],
        'categories' => [
            ['id'=>'cat-meeting','name'=>'会議','color'=>'#5086bd'], ['id'=>'cat-visit','name'=>'訪問','color'=>'#e87556'],
            ['id'=>'cat-work','name'=>'作業','color'=>'#209885'], ['id'=>'cat-vacation','name'=>'休暇','color'=>'#9a83c8'],
            ['id'=>'cat-other','name'=>'その他','color'=>'#d09839'],
        ],
        'schedules' => [
            ['id'=>'s1','memberId'=>'m1','date'=>'2026-07-20','endDate'=>'2026-07-20','start'=>'09:30','end'=>'10:30','title'=>'営業定例','category'=>'会議','memo'=>'週次の案件レビュー','repeat'=>'weekly','repeatUntil'=>'2026-09-30','reminderMinutes'=>10],
            ['id'=>'s2','memberId'=>'m1','date'=>'2026-07-21','endDate'=>'2026-07-21','start'=>'13:00','end'=>'15:00','title'=>'山田商事 訪問','category'=>'訪問'],
            ['id'=>'s3','memberId'=>'m1','date'=>'2026-07-23','endDate'=>'2026-07-23','start'=>'11:00','end'=>'12:00','title'=>'提案書レビュー','category'=>'作業'],
            ['id'=>'s4','memberId'=>'m2','date'=>'2026-07-20','endDate'=>'2026-07-20','start'=>'10:00','end'=>'11:00','title'=>'新規案件MTG','category'=>'会議'],
            ['id'=>'s5','memberId'=>'m2','date'=>'2026-07-22','endDate'=>'2026-07-22','start'=>'14:30','end'=>'16:30','title'=>'江東物流 訪問','category'=>'訪問','memo'=>'見積書を持参'],
            ['id'=>'s6','memberId'=>'m2','date'=>'2026-07-24','endDate'=>'2026-07-24','start'=>'09:00','end'=>'11:30','title'=>'月次レポート','category'=>'作業'],
            ['id'=>'s7','memberId'=>'m3','date'=>'2026-07-20','endDate'=>'2026-07-20','start'=>'13:00','end'=>'14:00','title'=>'開発スプリント計画','category'=>'会議'],
            ['id'=>'s8','memberId'=>'m3','date'=>'2026-07-21','endDate'=>'2026-07-21','start'=>'10:00','end'=>'12:00','title'=>'API設計','category'=>'作業','memo'=>'認証方式を確定'],
            ['id'=>'s9','memberId'=>'m3','date'=>'2026-07-23','endDate'=>'2026-07-23','start'=>'15:00','end'=>'16:00','title'=>'リリース判定','category'=>'会議','private'=>true],
            ['id'=>'s10','memberId'=>'m4','date'=>'2026-07-21','endDate'=>'2026-07-21','start'=>'09:30','end'=>'11:30','title'=>'画面実装','category'=>'作業'],
            ['id'=>'s11','memberId'=>'m4','date'=>'2026-07-22','endDate'=>'2026-07-22','start'=>'13:30','end'=>'14:30','title'=>'コードレビュー','category'=>'会議'],
            ['id'=>'s12','memberId'=>'m4','date'=>'2026-07-24','endDate'=>'2026-07-24','start'=>'10:00','end'=>'12:00','title'=>'データ移行検証','category'=>'作業'],
            ['id'=>'s13','memberId'=>'m5','date'=>'2026-07-21','endDate'=>'2026-07-21','start'=>'09:00','end'=>'18:00','title'=>'有給休暇','category'=>'休暇','private'=>true],
            ['id'=>'s14','memberId'=>'m5','date'=>'2026-07-23','endDate'=>'2026-07-23','start'=>'10:00','end'=>'11:00','title'=>'採用面談','category'=>'会議'],
        ],
        'messages' => [
            ['id'=>'msg1','from'=>'鈴木 健太','to'=>'自分','subject'=>'山田商事からお電話です','body'=>'折り返しをご希望です。16時頃までご在席とのことでした。','time'=>'12:18','unread'=>true,'kind'=>'memo'],
            ['id'=>'msg2','from'=>'高橋 直子','to'=>'営業部','subject'=>'メンテナンスのお知らせ','body'=>'本日18:30から約30分、検証環境の更新を行います。','time'=>'10:42','unread'=>true,'kind'=>'message'],
            ['id'=>'msg3','from'=>'伊藤 由紀','to'=>'全員','subject'=>'来週の全社会議について','body'=>'資料は前日までに共有フォルダへ格納してください。','time'=>'昨日','kind'=>'message'],
        ],
    ];
}

function room_demo_schedules(): array {
    // 試験室の空き状況表示を確認するための予約・メンテナンス例です。
    return [
        ['id'=>'room-demo-m6-july','memberId'=>'m6','date'=>'2026-07-01','endDate'=>'2026-07-01','start'=>'00:00','end'=>'23:59','timePreset'=>'all-day','title'=>'電波暗室 予約済み','category'=>'会議','repeat'=>'daily','repeatUntil'=>'2026-07-31'],
        ['id'=>'room-demo-m7-1','memberId'=>'m7','date'=>'2026-07-27','start'=>'09:00','end'=>'12:00','timePreset'=>'morning','title'=>'材料評価','category'=>'会議'],
        ['id'=>'room-demo-m7-2','memberId'=>'m7','date'=>'2026-07-28','start'=>'13:00','end'=>'17:00','timePreset'=>'afternoon','title'=>'耐久試験','category'=>'会議'],
        ['id'=>'room-demo-m7-3','memberId'=>'m7','date'=>'2026-07-29','start'=>'09:00','end'=>'17:00','title'=>'終日試験','category'=>'会議'],
        ['id'=>'room-demo-m7-4','memberId'=>'m7','date'=>'2026-07-30','start'=>'09:00','end'=>'17:00','title'=>'設備点検','category'=>'作業'],
        ['id'=>'room-demo-m7-5','memberId'=>'m7','date'=>'2026-08-05','start'=>'09:00','end'=>'12:00','timePreset'=>'morning','title'=>'部材試験','category'=>'会議'],
        ['id'=>'room-demo-m7-6','memberId'=>'m7','date'=>'2026-08-12','start'=>'09:00','end'=>'17:00','title'=>'定期メンテナンス','category'=>'作業'],
        ['id'=>'room-demo-m8-1','memberId'=>'m8','date'=>'2026-07-27','start'=>'13:00','end'=>'17:00','timePreset'=>'afternoon','title'=>'通信評価','category'=>'会議'],
        ['id'=>'room-demo-m8-2','memberId'=>'m8','date'=>'2026-08-03','start'=>'09:00','end'=>'17:00','title'=>'情報機器試験','category'=>'会議'],
        ['id'=>'room-demo-m8-3','memberId'=>'m8','date'=>'2026-08-18','start'=>'09:00','end'=>'17:00','title'=>'設備校正','category'=>'作業'],
        ['id'=>'room-demo-m8-4','memberId'=>'m8','date'=>'2026-09-07','start'=>'09:00','end'=>'12:00','timePreset'=>'morning','title'=>'EMC事前評価','category'=>'会議'],
        ['id'=>'room-demo-m8-5','memberId'=>'m8','date'=>'2026-09-15','start'=>'13:00','end'=>'17:00','timePreset'=>'afternoon','title'=>'電子情報評価','category'=>'会議'],
    ];
}

function db(): PDO {
    // Web公開フォルダの外側へSQLiteを置き、WALモードで同時アクセスを扱います。
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $dataDir = dirname(__DIR__, 2) . '/GW';
    if (!is_dir($dataDir)) mkdir($dataDir, 0700, true);
    $pdo = new PDO('sqlite:' . $dataDir . '/group-watcher.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
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

function require_auth(): string {
    // 更新系APIはログイン済みセッションとCSRFトークンの両方を要求します。
    $memberId = $_SESSION['member_id'] ?? '';
    if ($memberId === '') respond(['error'=>'ログインが必要です'], 401);
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($token === '' || !hash_equals(csrf(), $token)) respond(['error'=>'セッションを確認できません'], 403);
    return $memberId;
}

function member_name(array $state, string $memberId): string {
    foreach ($state['members'] ?? [] as $member) if (($member['id'] ?? '') === $memberId) return (string)$member['name'];
    return '削除済みユーザー';
}

function bootstrap_payload(PDO $pdo): array {
    $record = current_record($pdo);
    $memberId = $_SESSION['member_id'] ?? null;
    if ($memberId && member_name($record['state'], $memberId) === '削除済みユーザー') $memberId = null;
    return $record + ['currentUserId'=>$memberId, 'csrfToken'=>csrf(), 'audit'=>audit_list($pdo)];
}

$pdo = db();
$action = $_GET['action'] ?? 'bootstrap';

// 初期データ取得とログイン状態確認。
if ($action === 'bootstrap') respond(bootstrap_payload($pdo));

// デモ認証：選択された有効なユーザーをセッションへ記録します。
if ($action === 'login') {
    require_post();
    $input = body();
    $memberId = (string)($input['memberId'] ?? '');
    $record = current_record($pdo);
    $name = member_name($record['state'], $memberId);
    if ($memberId === '' || $name === '削除済みユーザー') respond(['error'=>'ユーザーが見つかりません'], 404);
    session_regenerate_id(true);
    $_SESSION['member_id'] = $memberId;
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    $stmt = $pdo->prepare('INSERT INTO audit_logs(actor_id,actor_name,action,summary,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)');
    $stmt->execute([$memberId,$name,'ログイン','デモ版へログイン',null,null,date(DATE_ATOM)]);
    respond(bootstrap_payload($pdo));
}

if ($action === 'logout') {
    require_post();
    require_auth();
    $_SESSION = [];
    session_destroy();
    respond(['ok'=>true]);
}

if ($action === 'save') {
    // 受信時のversionが最新値と一致した場合だけ、状態と監査ログを同じ取引で更新します。
    require_post();
    $actorId = require_auth();
    $input = body();
    $state = $input['state'] ?? null;
    if (!is_array($state) || !isset($state['members'],$state['schedules'],$state['categories'],$state['messages'])) respond(['error'=>'保存データが不正です'], 422);
    $expectedVersion = (int)($input['version'] ?? 0);
    $pdo->beginTransaction();
    $record = current_record($pdo);
    if ($record['version'] !== $expectedVersion) {
        $pdo->rollBack();
        respond(bootstrap_payload($pdo) + ['error'=>'別の利用者による更新がありました'], 409);
    }
    $before = json_encode($record['state'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $after = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $nextVersion = $record['version'] + 1;
    $stmt = $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1');
    $stmt->execute([$after,$nextVersion,date(DATE_ATOM)]);
    $name = member_name($state, $actorId);
    $log = $pdo->prepare('INSERT INTO audit_logs(actor_id,actor_name,action,summary,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)');
    $log->execute([$actorId,$name,(string)($input['action'] ?? '更新'),(string)($input['summary'] ?? 'データを更新'),$before,$after,date(DATE_ATOM)]);
    $pdo->commit();
    respond(bootstrap_payload($pdo));
}

if ($action === 'undo') {
    // 指定された監査ログのbefore_jsonを復元し、取り消し自体も新しい履歴として残します。
    require_post();
    $actorId = require_auth();
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
    $restored = json_decode($target['before_json'], true);
    $restoredJson = json_encode($restored, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $nextVersion = $record['version'] + 1;
    $update = $pdo->prepare('UPDATE app_state SET payload=?,version=?,updated_at=? WHERE id=1');
    $update->execute([$restoredJson,$nextVersion,date(DATE_ATOM)]);
    $pdo->prepare('UPDATE audit_logs SET undone=1 WHERE id=?')->execute([$auditId]);
    $name = member_name($restored, $actorId);
    $log = $pdo->prepare('INSERT INTO audit_logs(actor_id,actor_name,action,summary,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)');
    $log->execute([$actorId,$name,'取り消し','「'.$target['summary'].'」を取り消し',json_encode($record['state'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),$restoredJson,date(DATE_ATOM)]);
    $pdo->commit();
    respond(bootstrap_payload($pdo));
}

respond(['error'=>'不明な操作です'], 404);

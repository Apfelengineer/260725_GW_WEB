<?php
declare(strict_types=1);

/*
 * 内部スケジューラーの予定を公開可能な空き状態へ変換し、専用SQLiteへ保存します。
 * 将来サーバーを分離するときは、kptc_publish_availability() の保存先をHTTPS送信へ差し替えます。
 */

const KPTC_PUBLIC_ROOM_IDS = ['m6', 'm7', 'm8'];
const KPTC_PUBLIC_STATUSES = ['morning_available', 'afternoon_available', 'reserved', 'maintenance'];

function kptc_availability_db_path(): string {
    $configured = trim((string)(getenv('KPTC_PUBLIC_AVAILABILITY_DB') ?: ''));
    if ($configured !== '') return $configured;
    return dirname(__DIR__, 2) . '/GW/public-availability.sqlite';
}

function kptc_availability_store(): PDO {
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $path = kptc_availability_db_path();
    $dataDir = dirname($path);
    if (!is_dir($dataDir)) mkdir($dataDir, 0700, true);
    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA busy_timeout=5000');
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec("CREATE TABLE IF NOT EXISTS public_availability (room_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('morning_available','afternoon_available','reserved','maintenance')), PRIMARY KEY(room_id,date))");
    $pdo->exec('CREATE TABLE IF NOT EXISTS public_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    $pdo->exec('PRAGMA optimize');
    return $pdo;
}

function kptc_date(string $value): DateTimeImmutable {
    return new DateTimeImmutable($value . ' 12:00:00', new DateTimeZone('Asia/Tokyo'));
}

function kptc_days_between(DateTimeImmutable $from, DateTimeImmutable $to): int {
    return (int)$from->diff($to)->format('%r%a');
}

function kptc_schedule_occurs_on(array $schedule, string $targetKey): bool {
    $startKey = (string)($schedule['date'] ?? '');
    if ($startKey === '') return false;
    $start = kptc_date($startKey);
    $end = kptc_date((string)($schedule['endDate'] ?? $startKey));
    $target = kptc_date($targetKey);
    $duration = max(0, kptc_days_between($start, $end));
    $offset = kptc_days_between($start, $target);
    if ($offset < 0) return false;

    $repeat = (string)($schedule['repeat'] ?? 'none');
    if ($repeat === 'none') return $offset <= $duration;
    $repeatUntil = kptc_date((string)($schedule['repeatUntil'] ?? $startKey));
    if ($target > $repeatUntil->modify('+' . $duration . ' days')) return false;
    if ($repeat === 'daily') return true;
    if ($repeat === 'weekly') return $offset % 7 <= $duration;
    if ($repeat !== 'monthly') return false;

    $cursor = $start->modify('first day of this month');
    $targetMonth = $target->modify('first day of this month');
    $startDay = (int)$start->format('j');
    while ($cursor <= $targetMonth) {
        $occurrence = $cursor->setDate((int)$cursor->format('Y'), (int)$cursor->format('n'), min($startDay, (int)$cursor->format('t')));
        if ($occurrence > $repeatUntil) break;
        if ($target >= $occurrence && $target <= $occurrence->modify('+' . $duration . ' days')) return true;
        $cursor = $cursor->modify('+1 month');
    }
    return false;
}

function kptc_minutes(string $value): int {
    $parts = array_map('intval', explode(':', $value));
    return ($parts[0] ?? 0) * 60 + ($parts[1] ?? 0);
}

function kptc_public_day_status(array $schedules, string $roomId, string $date): ?string {
    $morning = false;
    $afternoon = false;
    foreach ($schedules as $schedule) {
        if (($schedule['memberId'] ?? '') !== $roomId || !kptc_schedule_occurs_on($schedule, $date)) continue;
        $category = (string)($schedule['category'] ?? '');
        if ($category === '機器点検') return 'maintenance';
        if (!in_array($category, ['機器利用', 'キャンセル待ち'], true)) continue;
        $start = kptc_minutes((string)($schedule['start'] ?? '00:00'));
        $end = kptc_minutes((string)($schedule['end'] ?? '00:00'));
        if ($start < 12 * 60 && $end > 9 * 60) $morning = true;
        if ($start < 17 * 60 && $end > 13 * 60) $afternoon = true;
    }
    if ($morning && $afternoon) return 'reserved';
    if ($morning) return 'afternoon_available';
    if ($afternoon) return 'morning_available';
    return null;
}

function kptc_build_public_availability(array $state): array {
    // 公開ページが必要とする状態だけを12か月分生成し、予定の件名や利用者情報は含めません。
    $timezone = new DateTimeZone('Asia/Tokyo');
    $rangeStart = new DateTimeImmutable('first day of this month 00:00:00', $timezone);
    $rangeEnd = $rangeStart->modify('+12 months')->modify('-1 day');
    $schedules = is_array($state['schedules'] ?? null) ? $state['schedules'] : [];
    $records = [];
    foreach (KPTC_PUBLIC_ROOM_IDS as $roomId) {
        for ($date = $rangeStart; $date <= $rangeEnd; $date = $date->modify('+1 day')) {
            $key = $date->format('Y-m-d');
            $status = kptc_public_day_status($schedules, $roomId, $key);
            if ($status !== null) $records[] = ['roomId'=>$roomId, 'date'=>$key, 'status'=>$status];
        }
    }
    return [
        'schemaVersion'=>1,
        'updatedAt'=>(new DateTimeImmutable('now', $timezone))->format(DATE_ATOM),
        'rangeStart'=>$rangeStart->format('Y-m-d'),
        'rangeEnd'=>$rangeEnd->format('Y-m-d'),
        'records'=>$records,
    ];
}

function kptc_publish_availability(array $state, int $sourceVersion): array {
    $payload = kptc_build_public_availability($state);
    $pdo = kptc_availability_store();
    // 即時ロックと内部DB版番号により、同時保存時に古い空き状況が新しい内容を上書きすることを防ぎます。
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        $existingVersion = $pdo->query("SELECT value FROM public_meta WHERE key='sourceVersion'")->fetchColumn();
        $existingRangeStart = $pdo->query("SELECT value FROM public_meta WHERE key='rangeStart'")->fetchColumn();
        if ($existingVersion !== false && ((int)$existingVersion > $sourceVersion || ((int)$existingVersion === $sourceVersion && (string)$existingRangeStart >= $payload['rangeStart']))) {
            $existingUpdatedAt = $pdo->query("SELECT value FROM public_meta WHERE key='updatedAt'")->fetchColumn();
            $pdo->exec('ROLLBACK');
            if ($existingUpdatedAt !== false) $payload['updatedAt'] = (string)$existingUpdatedAt;
            return $payload;
        }
        $pdo->exec('DELETE FROM public_availability');
        $insert = $pdo->prepare('INSERT INTO public_availability(room_id,date,status) VALUES(?,?,?)');
        foreach ($payload['records'] as $record) $insert->execute([$record['roomId'], $record['date'], $record['status']]);
        $meta = $pdo->prepare('INSERT OR REPLACE INTO public_meta(key,value) VALUES(?,?)');
        foreach (['schemaVersion','updatedAt','rangeStart','rangeEnd'] as $key) $meta->execute([$key, (string)$payload[$key]]);
        $meta->execute(['sourceVersion', (string)$sourceVersion]);
        // BEGIN IMMEDIATE はPDOの取引フラグへ反映されないため、SQLで確実に確定します。
        $pdo->exec('COMMIT');
    } catch (Throwable $error) {
        try { $pdo->exec('ROLLBACK'); } catch (Throwable $rollbackError) { /* 既に取引が閉じている場合は元の例外を優先します。 */ }
        throw $error;
    }
    return $payload;
}

function kptc_read_public_availability(): ?array {
    $pdo = kptc_availability_store();
    $metaRows = $pdo->query('SELECT key,value FROM public_meta')->fetchAll(PDO::FETCH_KEY_PAIR);
    if (!isset($metaRows['updatedAt'])) return null;
    $availability = array_fill_keys(KPTC_PUBLIC_ROOM_IDS, []);
    $rows = $pdo->query('SELECT room_id,date,status FROM public_availability ORDER BY room_id,date')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $row) {
        if (isset($availability[$row['room_id']])) $availability[$row['room_id']][$row['date']] = $row['status'];
    }
    return [
        'schemaVersion'=>(int)($metaRows['schemaVersion'] ?? 1),
        'updatedAt'=>$metaRows['updatedAt'],
        'rangeStart'=>$metaRows['rangeStart'] ?? '',
        'rangeEnd'=>$metaRows['rangeEnd'] ?? '',
        'availability'=>$availability,
    ];
}

// 補助ファイル単体へのアクセスではデータを返しません。
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

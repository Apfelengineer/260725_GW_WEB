<?php
declare(strict_types=1);

/*
 * 内部スケジューラーの予定から、公開可能な3か月分の空き状況JSONを生成します。
 * 同じJSONファイルを毎回置き換えるため、公開側に過去月の履歴やデータベースは残りません。
 */

const KPTC_PUBLIC_ROOM_IDS = ['m6', 'm7', 'm8'];

function kptc_availability_json_path(): string {
    $configured = trim((string)(getenv('KPTC_PUBLIC_AVAILABILITY_JSON') ?: ''));
    if ($configured !== '') return $configured;
    return dirname(__DIR__, 2) . '/GW/public-availability.json';
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

    return $offset <= $duration;
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

function kptc_build_public_availability(array $state, int $sourceVersion): array {
    // 当月を含む3か月分だけを生成し、予定の件名、メモ、利用者情報は含めません。
    $timezone = new DateTimeZone('Asia/Tokyo');
    $rangeStart = new DateTimeImmutable('first day of this month 00:00:00', $timezone);
    $rangeEnd = $rangeStart->modify('+3 months')->modify('-1 day');
    $schedules = is_array($state['schedules'] ?? null) ? $state['schedules'] : [];
    $availability = array_fill_keys(KPTC_PUBLIC_ROOM_IDS, []);
    foreach (KPTC_PUBLIC_ROOM_IDS as $roomId) {
        for ($date = $rangeStart; $date <= $rangeEnd; $date = $date->modify('+1 day')) {
            $key = $date->format('Y-m-d');
            $status = kptc_public_day_status($schedules, $roomId, $key);
            if ($status !== null) $availability[$roomId][$key] = $status;
        }
    }
    return [
        'schemaVersion'=>1,
        'sourceVersion'=>$sourceVersion,
        'updatedAt'=>(new DateTimeImmutable('now', $timezone))->format(DATE_ATOM),
        'rangeStart'=>$rangeStart->format('Y-m-d'),
        'rangeEnd'=>$rangeEnd->format('Y-m-d'),
        'availability'=>$availability,
    ];
}

function kptc_read_public_availability(): ?array {
    $path = kptc_availability_json_path();
    if (!is_file($path)) return null;
    $contents = file_get_contents($path);
    if ($contents === false) return null;
    $payload = json_decode($contents, true);
    return is_array($payload) && isset($payload['updatedAt'], $payload['availability']) ? $payload : null;
}

function kptc_publish_availability(array $state, int $sourceVersion): array {
    $payload = kptc_build_public_availability($state, $sourceVersion);
    $existing = kptc_read_public_availability();
    if ($existing !== null) {
        $existingVersion = (int)($existing['sourceVersion'] ?? 0);
        $existingRangeStart = (string)($existing['rangeStart'] ?? '');
        if ($existingVersion > $sourceVersion || ($existingVersion === $sourceVersion && $existingRangeStart >= $payload['rangeStart'])) return $existing;
    }

    $path = kptc_availability_json_path();
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('公開JSONの保存先を作成できません');
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) throw new RuntimeException('公開JSONを生成できません');

    // 一時ファイルを同じ場所へ書いてから置換し、閲覧中に不完全なJSONが見えないようにします。
    $temporary = $path . '.tmp.' . bin2hex(random_bytes(6));
    try {
        if (file_put_contents($temporary, $json . PHP_EOL, LOCK_EX) === false) throw new RuntimeException('公開JSONを書き込めません');
        chmod($temporary, 0600);
        if (!rename($temporary, $path)) throw new RuntimeException('公開JSONを置き換えられません');
    } finally {
        if (is_file($temporary)) unlink($temporary);
    }
    return $payload;
}

// 補助ファイル単体へのアクセスではデータを返しません。
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

<?php
declare(strict_types=1);

/*
 * 内部スケジューラーの予定から、公開可能な3か月分の空き状況JSONを生成します。
 * 同じJSONファイルを毎回置き換えるため、公開側に過去月の履歴やデータベースは残りません。
 */

require_once __DIR__ . '/availability-contract.php';

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

// 補助ファイル単体へのアクセスではデータを返しません。
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

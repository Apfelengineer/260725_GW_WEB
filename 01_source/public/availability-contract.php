<?php
declare(strict_types=1);

/* 公開側と内部側で共有する、個人情報を含まないJSON形式の検証・保存処理です。 */
const KPTC_LEGACY_PUBLIC_ROOM_IDS = ['m6', 'm7', 'm8'];
const KPTC_PUBLIC_MAX_ROOMS = 32;

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

function kptc_read_public_availability(): ?array {
    $path = kptc_availability_json_path();
    if (!is_file($path)) return null;
    $contents = file_get_contents($path);
    if ($contents === false) return null;
    $payload = json_decode($contents, true);
    return is_array($payload) && isset($payload['updatedAt'], $payload['availability']) ? $payload : null;
}

function kptc_validate_public_availability(array $payload): array {
    // 外部公開に不要な項目や未知の状態値を受け入れず、個人情報の混入を防ぎます。
    $schemaVersion = $payload['schemaVersion'] ?? null;
    if (!is_int($schemaVersion) || !in_array($schemaVersion, [1, 2], true)) throw new InvalidArgumentException('未対応のJSON形式です');
    $expectedKeys = $schemaVersion === 2
        ? ['schemaVersion', 'sourceVersion', 'updatedAt', 'rangeStart', 'rangeEnd', 'rooms', 'availability']
        : ['schemaVersion', 'sourceVersion', 'updatedAt', 'rangeStart', 'rangeEnd', 'availability'];
    $actualKeys = array_keys($payload);
    sort($expectedKeys);
    sort($actualKeys);
    if ($actualKeys !== $expectedKeys) throw new InvalidArgumentException('JSONの項目が不正です');
    if (!is_int($payload['sourceVersion']) || $payload['sourceVersion'] < 1) throw new InvalidArgumentException('更新番号が不正です');
    if (!is_string($payload['updatedAt']) || DateTimeImmutable::createFromFormat(DATE_ATOM, $payload['updatedAt']) === false) throw new InvalidArgumentException('更新日時が不正です');
    foreach (['rangeStart', 'rangeEnd'] as $key) {
        if (!is_string($payload[$key]) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $payload[$key])) throw new InvalidArgumentException('表示期間が不正です');
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $payload[$key], new DateTimeZone('Asia/Tokyo'));
        if ($parsed === false || $parsed->format('Y-m-d') !== $payload[$key]) throw new InvalidArgumentException('表示期間が不正です');
    }
    $rangeStart = kptc_date($payload['rangeStart']);
    $rangeEnd = kptc_date($payload['rangeEnd']);
    $days = kptc_days_between($rangeStart, $rangeEnd);
    if ($days < 27 || $days > 93) throw new InvalidArgumentException('表示期間は3か月以内にしてください');
    if (!is_array($payload['availability'])) throw new InvalidArgumentException('試験室の構成が不正です');
    $expectedRoomKeys = KPTC_LEGACY_PUBLIC_ROOM_IDS;
    if ($schemaVersion === 2) {
        if (!is_array($payload['rooms']) || !array_is_list($payload['rooms']) || count($payload['rooms']) < 1 || count($payload['rooms']) > KPTC_PUBLIC_MAX_ROOMS) throw new InvalidArgumentException('公開する試験室の件数が不正です');
        $expectedRoomKeys = [];
        foreach ($payload['rooms'] as $room) {
            if (!is_array($room)) throw new InvalidArgumentException('試験室情報が不正です');
            $roomExpectedKeys = ['id', 'name', 'image', 'description'];
            $roomActualKeys = array_keys($room);
            sort($roomExpectedKeys);
            sort($roomActualKeys);
            if ($roomActualKeys !== $roomExpectedKeys) throw new InvalidArgumentException('試験室情報の項目が不正です');
            $roomId = $room['id'] ?? null;
            if (!is_string($roomId) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/', $roomId) || in_array($roomId, $expectedRoomKeys, true)) throw new InvalidArgumentException('試験室IDが不正です');
            if (!is_string($room['name']) || trim($room['name']) === '' || strlen($room['name']) > 300) throw new InvalidArgumentException('試験室名が不正です');
            if (!is_string($room['image']) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.png$/', $room['image']) || basename($room['image']) !== $room['image']) throw new InvalidArgumentException('試験室画像が不正です');
            if (!is_string($room['description']) || strlen($room['description']) > 900) throw new InvalidArgumentException('試験室の説明が不正です');
            $expectedRoomKeys[] = $roomId;
        }
    }
    $roomKeys = array_keys($payload['availability']);
    sort($roomKeys);
    sort($expectedRoomKeys);
    if ($roomKeys !== $expectedRoomKeys) throw new InvalidArgumentException('試験室の構成が不正です');
    $allowedStatuses = ['maintenance', 'reserved', 'morning_available', 'afternoon_available'];
    foreach ($payload['availability'] as $roomId => $dates) {
        if (!in_array($roomId, $expectedRoomKeys, true) || !is_array($dates)) throw new InvalidArgumentException('試験室の空き情報が不正です');
        foreach ($dates as $date => $status) {
            $parsedDate = is_string($date) ? DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('Asia/Tokyo')) : false;
            if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $parsedDate === false || $parsedDate->format('Y-m-d') !== $date || $date < $payload['rangeStart'] || $date > $payload['rangeEnd']) throw new InvalidArgumentException('空き情報の日付が不正です');
            if (!is_string($status) || !in_array($status, $allowedStatuses, true)) throw new InvalidArgumentException('空き情報の状態が不正です');
        }
    }
    return $payload;
}

function kptc_compare_public_availability(array $incoming, array $existing): int {
    // 月、内部DBの更新番号、送信生成時刻の順で比較し、定期送信を疎通確認にも利用します。
    $rangeComparison = strcmp((string)$incoming['rangeStart'], (string)($existing['rangeStart'] ?? ''));
    if ($rangeComparison !== 0) return $rangeComparison <=> 0;
    $versionComparison = ((int)$incoming['sourceVersion']) <=> ((int)($existing['sourceVersion'] ?? 0));
    if ($versionComparison !== 0) return $versionComparison;
    return strcmp((string)$incoming['updatedAt'], (string)($existing['updatedAt'] ?? '')) <=> 0;
}

function kptc_store_public_availability(array $payload): array {
    $payload = kptc_validate_public_availability($payload);
    $existing = kptc_read_public_availability();
    if ($existing !== null) {
        try { $existing = kptc_validate_public_availability($existing); }
        catch (InvalidArgumentException $error) { $existing = null; }
    }
    if ($existing !== null) {
        $comparison = kptc_compare_public_availability($payload, $existing);
        if ($comparison < 0) throw new UnexpectedValueException('現在の公開情報より古いJSONです');
        if ($comparison === 0) return $existing;
    }

    $path = kptc_availability_json_path();
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('公開JSONの保存先を作成できません');
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) throw new RuntimeException('公開JSONを生成できません');
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

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

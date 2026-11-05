<?php
declare(strict_types=1);
/* Python/Dockerのない共有サーバー専用。非公開領域から公開JSONだけを一括置換します。 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (!isset($argv[1]) || !is_file($argv[1])) { fwrite(STDERR, "Usage: php delivery-local-cli.php /private/path/availability-contract.php\n"); exit(2); }
require_once $argv[1];
function delivery_path(string $key): string {
    $value = trim((string)getenv($key));
    if ($value === '' || $value[0] !== '/') throw new RuntimeException("$key requires an absolute path");
    return $value;
}
function delivery_read(string $path): string {
    if (is_link($path)) throw new RuntimeException('公開JSONのリンクは配信できません');
    $handle = fopen($path, 'rb');
    if ($handle === false) throw new RuntimeException('公開JSONを読めません');
    try { $raw = stream_get_contents($handle, 131073); }
    finally { fclose($handle); }
    if ($raw === false || strlen($raw) > 131072) throw new RuntimeException('公開JSONのサイズが不正です');
    return $raw;
}
function delivery_validate(string $raw): array {
    $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($data) || ($data['schemaVersion'] ?? null) !== 2) throw new RuntimeException('公開JSONの形式が不正です');
    $data = kptc_validate_public_availability($data);
    $today = new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo'));
    $start = $today->modify('first day of this month')->setTime(0, 0);
    if ($data['rangeStart'] !== $start->format('Y-m-d') || $data['rangeEnd'] !== $start->modify('+3 months -1 day')->format('Y-m-d')) throw new RuntimeException('当月を含む3か月のJSONではありません');
    if (strtotime($data['updatedAt']) > time() + 300) throw new RuntimeException('公開JSONの更新日時が未来です');
    return $data;
}
function delivery_atomic(string $path, string $raw): void {
    $temporary = tempnam(dirname($path), '.kptc-');
    if ($temporary === false) throw new RuntimeException('配信用一時ファイルを作成できません');
    try {
        if (file_put_contents($temporary, $raw, LOCK_EX) !== strlen($raw) || !chmod($temporary, 0644) || !rename($temporary, $path)) throw new RuntimeException('配信ファイルを一括置換できません');
    } finally { if (is_file($temporary)) unlink($temporary); }
}
try {
    $source = delivery_path('KPTC_AVAILABILITY_SOURCE_JSON');
    $target = delivery_path('KPTC_AVAILABILITY_LOCAL_JSON');
    $statusPath = delivery_path('KPTC_AVAILABILITY_STATUS_JSON');
    if ($source === $target || $target === $statusPath) throw new RuntimeException('生成先・公開先・状態は別のファイルにしてください');
    foreach ([dirname($target), dirname($statusPath)] as $directory) {
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new RuntimeException('配信先を作成できません');
    }
    $lock = fopen(dirname($statusPath) . '/.delivery.lock', 'c');
    if ($lock === false) throw new RuntimeException('配信ロックを作成できません');
    if (!flock($lock, LOCK_EX | LOCK_NB)) exit(0);
    $targetHash = hash('sha256', 'local:' . $target);
    $status = is_file($statusPath) ? json_decode(delivery_read($statusPath), true) : [];
    if (!is_array($status) || ($status['targetHash'] ?? '') !== $targetHash) $status = [];
    $status['targetHash'] = $targetHash;
    $status['mode'] = 'local';
    $status['lastAttemptAt'] = gmdate(DATE_ATOM);
    try {
        $raw = delivery_read($source);
        $data = delivery_validate($raw);
        $stale = max(600, (int)(getenv('KPTC_PUBLIC_AVAILABILITY_STALE_SECONDS') ?: 1800));
        if (strtotime($data['updatedAt']) < time() - $stale) throw new RuntimeException('公開JSONが古いため配信を停止しました');
        $generation = [$data['rangeStart'], $data['sourceVersion'], strtotime($data['updatedAt'])];
        if (isset($status['generation']) && $generation < $status['generation']) throw new RuntimeException('配信済みより古いJSONは配信できません');
        $existingRaw = null;
        if (is_file($target)) {
            $existingRaw = delivery_read($target);
            try { $existing = delivery_validate($existingRaw); }
            catch (Throwable $error) { $existing = null; }
            if ($existing !== null && kptc_compare_public_availability($data, $existing) < 0) throw new RuntimeException('公開先より古いJSONは配信できません');
        }
        $unchanged = ($status['ok'] ?? false) === true && ($status['sha256'] ?? '') === hash('sha256', $raw) && $existingRaw === $raw;
        if ($existingRaw !== $raw) delivery_atomic($target, $raw);
        $status = array_merge($status, ['ok'=>true, 'sourceVersion'=>$data['sourceVersion'], 'generation'=>$generation, 'sha256'=>hash('sha256', $raw), 'lastSuccessAt'=>$unchanged ? $status['lastSuccessAt'] : gmdate(DATE_ATOM), 'consecutiveFailures'=>0, 'lastError'=>'']);
    } catch (Throwable $error) {
        $status = array_merge($status, ['ok'=>false, 'consecutiveFailures'=>(int)($status['consecutiveFailures'] ?? 0)+1, 'lastError'=>$error->getMessage()]);
    }
    delivery_atomic($statusPath, json_encode($status, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n");
    flock($lock, LOCK_UN); fclose($lock);
    echo json_encode(['ok'=>$status['ok'], 'mode'=>'local', 'sourceVersion'=>$status['sourceVersion'] ?? null, 'lastError'=>$status['lastError']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
    exit($status['ok'] ? 0 : 1);
} catch (Throwable $error) { fwrite(STDERR, $error->getMessage() . "\n"); exit(2); }

<?php
declare(strict_types=1);

/* 予定だけを取り込みます。ユーザー、権限、パスワードは変更しません。 */
function kptc_import_document(string $raw): array {
    if (strlen($raw) > 1048576) throw new InvalidArgumentException('JSONは1MiB以下にしてください');
    if (str_starts_with($raw, "\xEF\xBB\xBF")) $raw = substr($raw, 3);
    try { $document = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { throw new InvalidArgumentException('JSONの形式が不正です'); }
    if (!is_array($document)) throw new InvalidArgumentException('予定の一覧がありません');
    if (isset($document['payload'])) {
        // バックアップからの取込時も破損を検出。過去予定の取込にはfromDateの制限を適用しません。
        $payload = $document['payload'];
        if (!is_array($payload) || ($payload['schemaVersion'] ?? null) !== 1 || ($payload['kind'] ?? '') !== 'kptc-scheduler-future'
            || !is_string($document['sha256'] ?? null)
            || !hash_equals(hash('sha256', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)), $document['sha256'])) {
            throw new InvalidArgumentException('バックアップ形式または整合性確認値が不正です');
        }
        $items = $payload['state']['schedules'] ?? null;
    } else {
        $items = array_is_list($document) ? $document : ($document['schedules'] ?? null);
    }
    if (!is_array($items) || !array_is_list($items) || count($items) < 1 || count($items) > 5000) throw new InvalidArgumentException('予定は1〜5000件の配列で指定してください');
    return $items;
}

function kptc_import_normalize(array $item): array {
    $allowed = ['id','memberId','date','endDate','start','end','timePreset','title','location','category','memo','private'];
    if (array_diff(array_keys($item), $allowed)) throw new InvalidArgumentException('未対応の項目が含まれています');
    foreach (['memberId','date','start','end','title','category'] as $key) {
        if (!isset($item[$key]) || !is_string($item[$key]) || trim($item[$key]) === '') throw new InvalidArgumentException($key . 'を文字列で指定してください');
    }
    foreach (['id','endDate','timePreset','memo'] as $key) {
        if (isset($item[$key]) && !is_string($item[$key])) throw new InvalidArgumentException($key . 'を文字列で指定してください');
    }
    if (array_key_exists('private', $item) && !is_bool($item['private'])) throw new InvalidArgumentException('privateはtrueまたはfalseで指定してください');
    if (array_key_exists('location', $item) && (!is_string($item['location']) || strlen($item['location']) > 1000)) throw new InvalidArgumentException('locationは1000バイト以下の文字列で指定してください');
    $schedule = [
        'memberId'=>$item['memberId'], 'date'=>$item['date'], 'endDate'=>$item['endDate'] ?? $item['date'],
        'start'=>$item['start'], 'end'=>$item['end'], 'timePreset'=>$item['timePreset'] ?? 'custom',
        'title'=>$item['title'], 'category'=>$item['category'], 'memo'=>$item['memo'] ?? '', 'private'=>$item['private'] ?? false,
        'location'=>$item['location'] ?? '',
    ];
    foreach (['date','endDate'] as $key) {
        if (!preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D', $schedule[$key], $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) throw new InvalidArgumentException($key . 'に実在する日付をYYYY-MM-DDで指定してください');
    }
    if ($schedule['endDate'] < $schedule['date']) throw new InvalidArgumentException('終了日が開始日より前です');
    if (!preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D', $schedule['start'])
        || !preg_match('/^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/D', $schedule['end'])
        || ($schedule['date'] === $schedule['endDate'] && $schedule['end'] <= $schedule['start'])) throw new InvalidArgumentException('時刻または開始・終了の順序が不正です');
    if (!in_array($schedule['timePreset'], ['custom','all-day','morning','afternoon'], true)) throw new InvalidArgumentException('timePresetが不正です');
    $presetTimes = ['all-day'=>['00:00','23:59'], 'morning'=>['09:00','12:00'], 'afternoon'=>['13:00','17:00']];
    if (isset($presetTimes[$schedule['timePreset']]) && [$schedule['start'],$schedule['end']] !== $presetTimes[$schedule['timePreset']]) throw new InvalidArgumentException('時間帯設定と開始・終了時刻が一致しません');
    if (strlen($schedule['title']) > 1000 || strlen($schedule['memo']) > 20000) throw new InvalidArgumentException('予定名またはメモが長すぎます');
    // IDなしは内容から安定したIDを作り、同じファイルの再取込で重複を増やしません。
    $identity = $schedule;
    if ($identity['location'] === '') unset($identity['location']); // 場所のない旧ファイルの自動IDを維持します。
    $id = $item['id'] ?? ('import-' . hash('sha256', json_encode($identity, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)));
    if ($id === '' || strlen($id) > 120 || preg_match('/[\x00-\x20\x7F]/', $id)) throw new InvalidArgumentException('予定IDが不正です');
    return ['id'=>$id] + $schedule;
}

function kptc_import_plan(array $items, array $state): array {
    $memberNames = array_column($state['members'], 'name', 'id');
    $categories = array_fill_keys(array_column($state['categories'], 'name'), true);
    $existing = array_column($state['schedules'], null, 'id');
    $seen = []; $added = []; $skipped = 0; $preview = [];
    foreach ($items as $index => $item) {
        try {
            if (!is_array($item)) throw new InvalidArgumentException('予定をオブジェクトで指定してください');
            $schedule = kptc_import_normalize($item);
            $id = $schedule['id'];
            if (!isset($memberNames[$schedule['memberId']])) throw new InvalidArgumentException('未登録のmemberIdです。先に対象ユーザー・試験室を登録してください');
            if (!isset($categories[$schedule['category']])) throw new InvalidArgumentException('未登録の予定種別です。先に予定種別を登録してください');
            if (isset($seen[$id])) throw new InvalidArgumentException('ファイル内で予定IDまたはIDなし予定の内容が重複しています');
            $seen[$id] = true;
            if (isset($existing[$id])) {
                if (kptc_import_normalize($existing[$id]) !== $schedule) throw new InvalidArgumentException('既存予定と同じIDで内容が異なります。上書きは行いません');
                $skipped++;
            } else { $added[] = $schedule; }
            if (count($preview) < 20) $preview[] = $schedule + ['memberName'=>$memberNames[$schedule['memberId']]];
        } catch (InvalidArgumentException $error) { throw new InvalidArgumentException(($index + 1) . '件目：' . $error->getMessage()); }
    }
    return ['count'=>count($items), 'added'=>count($added), 'skipped'=>$skipped, 'items'=>$preview, 'schedules'=>$added];
}

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) { http_response_code(404); exit; }

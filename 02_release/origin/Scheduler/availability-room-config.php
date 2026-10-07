<?php
declare(strict_types=1);

/*
 * 外部公開を許可した「試験室」所属ユーザーだけを公開対象へ変換します。
 * 新しい試験室はこの一覧へユーザーIDを加え、<ユーザーID>.pngを外部側へ置くと公開できます。
 * 一覧の順序が公開画面の表示順になります。
 */
function kptc_public_room_ids(): array {
    return ['m6', 'm7', 'm8'];
}

function kptc_public_room_overrides(): array {
    return [
        'm6'=>['name'=>'電波暗室'],
        'm7'=>['name'=>'電磁波妨害評価装置(G-TEM)'],
        'm8'=>[
            'name'=>'パルスサージシステム',
            'description'=>'(入力インパルス試験機、静電気試験機、サージイミュニティ試験機、FTB試験機、低周波EMC試験機)',
        ],
    ];
}

function kptc_public_rooms_from_state(array $state): array {
    $overrides = kptc_public_room_overrides();
    $membersById = [];
    foreach ($state['members'] ?? [] as $member) {
        if (!is_array($member)) continue;
        $memberId = trim((string)($member['id'] ?? ''));
        if ($memberId !== '') $membersById[$memberId] = $member;
    }
    $rooms = [];
    foreach (kptc_public_room_ids() as $memberId) {
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/', $memberId)) throw new InvalidArgumentException('公開する試験室のユーザーIDが不正です');
        $member = $membersById[$memberId] ?? null;
        if (!is_array($member) || ($member['group'] ?? '') !== '試験室') throw new InvalidArgumentException('公開対象の試験室ユーザーが見つかりません: ' . $memberId);
        $override = is_array($overrides[$memberId] ?? null) ? $overrides[$memberId] : [];
        $name = trim((string)($override['name'] ?? $member['name'] ?? ''));
        if ($name === '') throw new InvalidArgumentException('公開する試験室名がありません');
        $rooms[] = [
            'id'=>$memberId,
            'memberId'=>$memberId,
            'name'=>$name,
            'image'=>(string)($override['image'] ?? ($memberId . '.png')),
            'description'=>(string)($override['description'] ?? ''),
        ];
    }
    if ($rooms === []) throw new InvalidArgumentException('公開する試験室がありません');
    return $rooms;
}

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

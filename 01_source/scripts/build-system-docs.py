"""現行実装に合わせた日本語PDFを再生成する。実環境の秘密やDBは読み込まない。"""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'docs'
pdfmetrics.registerFont(TTFont('Japanese', os.environ.get('KPTC_DOC_FONT', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf')))
FONT = 'Japanese'
BODY = ParagraphStyle('body', fontName=FONT, fontSize=9.4, leading=15, wordWrap='CJK', textColor=colors.HexColor('#23364a'))
SMALL = ParagraphStyle('small', parent=BODY, fontSize=8.2, leading=12)
HEAD = ParagraphStyle('head', parent=BODY, fontSize=19, leading=27, textColor=colors.HexColor('#123c61'))
CODE = ParagraphStyle('code', fontName='Courier', fontSize=7.5, leading=11, textColor=colors.HexColor('#152c40'))
W, H = 595.28, 841.89
WIDTH = W-80

def p(text): return ('p', text)
def code(text): return ('code', text.strip('\n'))
def table(headers, rows, widths=None): return ('table', headers, rows, widths)
def flow(*lines): return ('flow', lines)
def page(title, *items): return (title, items)

def render(filename, title, pages):
    out = OUT / filename
    c = canvas.Canvas(str(out), pagesize=(W,H))
    c.setTitle('KPTC Scheduler | '+title)
    c.setAuthor('KPTC Scheduler project')
    for number,(heading,items) in enumerate(pages,1):
        c.setFillColor(colors.HexColor('#123c61')); c.rect(0,H-12,W,12,fill=1,stroke=0)
        c.setFont(FONT,8); c.drawString(40,H-35,'KPTC Scheduler  /  '+title)
        c.setStrokeColor(colors.HexColor('#d5e2eb')); c.line(40,43,W-40,43)
        c.setFont(FONT,8); c.drawString(40,29,'2026-09-04 改訂  |  実装基準 main / 1977897')
        c.drawRightString(W-40,29,f'{number} / {len(pages)}')
        y=H-65
        def draw(obj,gap=10):
            nonlocal y
            _,height=obj.wrap(WIDTH,y-60)
            if y-height < 57: raise RuntimeError(f'Page overflow: {filename} p{number} {heading} {y-height}')
            obj.drawOn(c,40,y-height); y-=height+gap
        draw(Paragraph(escape(heading),HEAD),18)
        for item in items:
            kind=item[0]
            if kind=='p': draw(Paragraph(escape(item[1]).replace('\n','<br/>'),BODY))
            elif kind=='code':
                for line in item[1].splitlines():
                    if pdfmetrics.stringWidth(line,'Courier',7.5)>WIDTH-20:
                        raise RuntimeError('Code line too long: '+line)
                text='<br/>'.join(escape(line).replace(' ','&#160;') or '&#160;' for line in item[1].splitlines())
                box=Table([[Paragraph(text,CODE)]],colWidths=[WIDTH])
                box.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#eef3f7')),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]))
                draw(box)
            elif kind=='table':
                headers,rows,widths=item[1:]
                widths=widths or [WIDTH/len(headers)]*len(headers)
                data=[[Paragraph(escape(str(v)).replace('\n','<br/>'),SMALL) for v in row] for row in [headers]+rows]
                t=Table(data,colWidths=widths,hAlign='LEFT')
                t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dbe9f3')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f5f8fa')]),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.3,colors.HexColor('#d5e2eb')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
                draw(t)
            elif kind=='flow':
                for index,line in enumerate(item[1]):
                    t=Table([[Paragraph(escape(line),BODY)]],colWidths=[WIDTH])
                    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#e6f1f4')),('BOX',(0,0),(-1,-1),.7,colors.HexColor('#91b5c2')),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]))
                    draw(t,4)
                    if index<len(item[1])-1: draw(Paragraph('↓',BODY),4)
        c.showPage()
    c.save()
    print(f'{out}: {len(pages)} pages')

spec=[
page('現行アプリケーション仕様書',
p('対象：KPTC Scheduler。内部予定表（origin）、外部空き状況（tamanegi）、連携確認用ポータル（renkon）。現行コードを基準に旧ログイン仕様と古い配布構成を改訂しました。'),
table(['項目','現行仕様'],[
('利用開始','社内ポータルのCBCトークンを検証し、一般モードで予定表を表示。ユーザー選択ログイン画面はありません。'),
('管理','管理者パスワードを確認して管理者モードへ切替。'),
('保存','originのSQLite。公開側にはDBを置かず3か月のJSONのみ。'),
('今回追加','毎日22時（日本時間）、当日以降の予定を最新1世代の非公開JSONへ保存。新規SQLiteへの復元CLIを追加。'),
('資料範囲','機能、認証境界、公開変換、DB、バックアップ、運用上の制約。')],[95,WIDTH-95]),
p('2026年9月4日のさくら環境：mainへ反映済み。22:28の手動バックアップは23件・8,036バイト、復元検証成功。定期実行は登録済みですが、この時点で翌日の自動実行は未観測です。'),
table(['章','内容'],[(str(i),v) for i,v in enumerate(['構成とデータ境界','入口・権限・安全性','予定操作と管理','公開カレンダー','保存・API・配布','バックアップ仕様','復元仕様と受入基準'],1)],[45,WIDTH-45])),
page('1  構成とデータ境界',
flow('社内システム（開発時はrenkon） → CBCトークン付きURL','origin：予定表・PHP API・内部SQLite','originで3か月の空き状態に変換 → HMAC署名付きHTTPS POST','tamanegi：検証して単一JSONに保存 → 一般公開カレンダー'),
table(['保管物','内容・扱い'],[
('内部DB','ユーザー、試験室、種別、予定、操作履歴、互換アカウント、管理者設定。Web非公開。'),
('公開JSON','許可室のID・名称・説明・画像・日別状態・期間・更新世代。個人名、件名、メモは送信しません。'),
('バックアップJSON','当日以降に終了する全予定と復元用設定。機密情報を含み、外部公開やGitHubへの保存は禁止。'),
('renkon','3桁ID入力と入口リンクを持つ模擬サイト。本番では既存社内サイトへ連携処理を組み込み、renkonの配布は不要。')],[120,WIDTH-120])),
page('2  入口・権限・安全性',
p('renkonは user_ と半角数字3桁を連結し、AES-256-CBCで暗号化。元鍵をSHA-256で32バイト化し、毎回異なる16バイトIVを使用します。Base64(IV＋暗号文)をURLエンコードしてtokenで渡します。originは復号結果が user_[0-9]{3} に完全一致するか確認します。旧ECB形式と日付付き形式は使用しません。'),
table(['状態','許可する操作'],[
('トークンなし・不正','画面入口は403 Forbidden。APIも有効な入口セッションが必要。'),
('一般モード','全員の予定閲覧・新規作成・編集・移動・コピー・貼付・削除。'),
('管理者モード','一般機能＋ユーザー・試験室・予定種別管理、履歴確認・取消、管理者パスワード変更。'),
('旧アカウント','admin/user/room列はDB互換用。現行画面の操作権限はモードで決まり、旧4権限ログイン・ゲスト入口はありません。')],[115,WIDTH-115]),
p('管理者パスワードは8～128文字。DBにはハッシュを保存します。5回連続の誤入力で同一セッションから60秒間切替を停止。セッションの既定期限は無操作30分・最大12時間です。更新時はCSRF検査と世代比較を行います。'),
p('重要：CBCは暗号化であり、本人確認・改ざん検出・有効期限・一度限りの使用を提供しません。3桁IDを実在ユーザーと照合する機能もありません。操作記録主体は最初の有効な一般／管理者アカウント等で、入力IDとの本人紐付けではありません。社内認証・ネットワーク制限・HTTPSを必ず併用し、既定鍵を本番では変更してください。')),
page('3  予定操作と管理',
table(['機能','仕様'],[
('表示','初期は今週。日・週・月、前後移動、今日へ戻る。週は月曜～日曜。長い氏名は折返し。'),
('絞込・休日','電気通信係／試験室、メンバー検索。土曜は青、日曜と2026・2027年の祝日は赤。'),
('入力','件名、ユーザー、予定種別、開始日・終了日、時間帯、メモ、非公開印。終了日は開始日以降。'),
('時間帯','時間指定／終日／午前9:00～12:00／午後13:00～17:00。'),
('種別','休暇、機器点検、機器利用、キャンセル待ち、所内会議、出張・外出、その他。管理者が変更可能。'),
('移動','他の日・他ユーザーへドラッグ。確認ダイアログで確定した場合だけ保存、取消では変更しない。'),
('複数操作','Shift＋クリックで複数選択、通常の別予定・日付クリックまたはEscで解除。コピー・貼付・削除を複数に適用。'),
('操作入口','予定右クリック：コピー・切取・削除。日付右クリック：新規・貼付。日付ダブルクリック：新規。Ctrl/Cmd+C・V、Delete、Escに対応。'),
('管理','ユーザー・試験室・種別の追加編集削除、順序指定。電話欄は「内線」。'),
('廃止済み','メッセージ、行き先・在籍表示、今日の予定欄、繰り返し、リマインダー。')],[98,WIDTH-98]),
p('非公開印は画面上の目印で、共有予定の内容を他の利用者から隠すアクセス制御ではありません。')),
page('4  公開カレンダーと試験室追加',
table(['内部予定の状態','公開画面'],[
('機器点検','メンテナンスとして「ー」。日付は隠す。'),
('9～12時だけ予約','「▼」＝予約可（午後のみ）。日付は隠す。'),
('13～17時だけ予約','「▲」＝予約可（午前のみ）。日付は隠す。'),
('午前と午後の両方','予約済み。濃い灰色、記号なし、日付の文字は黒。'),
('該当予約なし','予約可。日付表示。'),
('月の全営業日が満杯','予約済み（キャンセル待ち）の表示を月に重ねる。')],[180,WIDTH-180]),
p('予約として数える種別は「機器利用」「キャンセル待ち」。時間枠との重なりを集計し、機器点検を優先します。当月を含む3か月を表示。土曜は青系、日曜・祝日は赤系です。'),
p('現在の公開室：m6＝電波暗室、m7＝電磁波妨害評価装置(G-TEM)、m8＝パルスサージシステム。画像は各ID.pngを直接差替可能。問い合わせは denki@kptc.jp / 075-315-8634。スケジューラーからは別タブで開きます。'),
p('availability-room-config.phpの許可リストと表示順を使用し、所属だけで自動公開しません。生成JSONはschema v2、受信はv1/v2互換、1～32室。管理画面で室を追加し、許可ID・必要な名称上書き・画像を配置して送信すると、公開側の画面を再実装せず追加できます。')),
page('5  保存・API・ビルド配布',
table(['対象','役割'],[
('app_state','1行の共有JSON（members/categories/schedules）、version、更新時刻。競合はHTTP 409。'),
('audit_logs','変更者・内容・変更前後・取消済み状態。'),
('app_meta','移行完了印、送信状態、管理者パスワードハッシュ。'),
('auth_users','互換アカウント、所属メンバー、旧権限、有効状態、セッション無効化用番号。')],[110,WIDTH-110]),
p('主な内部API：bootstrap、save、undo、member-account、admin-mode-enter、admin-mode-exit、admin-mode-password。書込はセッションとCSRFを検査し、一般／管理者をサーバー側でも判定します。'),
p('外部受信はHMAC-SHA256、時刻差5分以内、128KiB以下、期間・室・状態・世代を検査。受信失敗でも内部予定は保存済みのまま、再送待ちとします。5分送信、10分監視。healthは新鮮なら200、古い／未生成なら503。'),
p('01_sourceを作業PCのViteでビルドし、02_release/origin・tamanegi・renkonへ分離。TSX/TSはJSへ変換、CSSは最適化、PHPは用途別コピー。originは認証PHPと生成HTMLを連結したindex.php、tamanegiはindex.htmlです。サーバーでNode.jsは不要ですがPHP実行環境と非公開設定は必要です。'),
p('実DB、環境設定、秘密鍵、公開JSON、バックアップ、ログは配布物・GitHubに含めません。')),
page('6  毎日22時のバックアップ仕様',
table(['項目','仕様'],[
('実行','さくら：日本時間cron 22時。Ubuntu：Asia/Tokyo指定のsystemd timer、停止中の取り逃しは起動後に実行。'),
('予定の対象','日本時間の実行日以降に終了する予定。未来の上限なし。開始が過去でも継続中なら含む。'),
('その他の対象','全ユーザー・試験室・予定種別、互換アカウント、管理者パスワードハッシュ。'),
('含めないもの','過去に終了した予定、操作履歴、元DBの全メタ情報、セッション、環境設定、共通鍵、画像、公開JSON。'),
('形式','payload＋sha256。payloadはschemaVersion=1、kind=kptc-scheduler-future、createdAt/fromDate/sourceVersion/state/authAccounts/adminPasswordHash。'),
('置換条件','元DB整合性・データ形式・JSON読み戻し・SHA-256・一時SQLiteへの復元検証がすべて成功した場合のみ原子的置換。'),
('保存方針','最新1世代のみ。失敗は前回正常JSONを残し非0終了。元DBを削除・変更しない。並行実行ロック。'),
('保護','Web非公開。JSON 600、新規フォルダー700。.lockは残る。JSON自体は暗号化されていない。')],[103,WIDTH-103]),
p('さくら：/home/apfelrunner/GW/backups/scheduler-latest.json\nUbuntu例：/var/lib/kptc-scheduler/backups/scheduler-latest.json\nKPTC_SCHEDULER_BACKUP_JSONで変更。未指定はDBの隣のbackups配下。')),
page('7  復元仕様・制約・受入基準',
flow('scheduler-latest.json → SHA-256と構造を検証','restore-scheduler-cli.php → 未使用名のSQLiteを作成し整合性確認','管理者が内容確認 → 利用停止中にDB設定を切替 → 公開送信の世代を調整'),
p('復元コマンドは既存ファイルを上書きせず、本番設定を自動変更しません。元DBと元の設定は切戻し用に保持してください。公開JSONのsourceVersionが復元DBより進んでいる場合、その値を上回る世代へ調整してから再送します。詳細は構築手順書の復元章を参照してください。'),
p('復元はバックアップ作成時点です。作成後に追加・変更された予定、含めなかった過去予定と履歴は戻りません。最新1世代方式は、誤削除を正常データとして翌日保存した場合や、同一サーバー全体の故障には対応できません。意味上の誤りまで検知する保証もありません。別媒体への複製とメール通知は未実装です。'),
table(['確認','合格条件'],[
('バックアップ試験','過去除外、当日・継続中・遠い未来を保存、破損DBでも前回維持、排他、権限600。'),
('復元試験','新規SQLiteの整合性ok、アカウント・設定維持、履歴空、既存DBを上書きしない。'),
('公開境界','backup/restore CLIはHTTP 404、トークンなし予定表403、公開カレンダー200。'),
('既知の保守','祝日は2026・2027年分。次年度追加、鍵管理、ログ確認、復元訓練が必要。')],[112,WIDTH-112]))
]

relations=[
page('ファイル機能・役割一覧と関係図',
p('ビルド前の正本は01_source、配布物は02_release。実行中のデータはどちらにも含めず、サーバーのWeb非公開領域へ分離します。今回のバックアップ・復元とrenkon入口を含む現行構成です。'),
flow('01_source：app / sakura / public / renkon / deploy / tests / scripts','作業PC：ViteでJS・CSSを生成し、許可されたPHP・画像をコピー','02_release：origin（内部） / tamanegi（外部） / renkon（模擬）','各サーバーへ配置 ＋ 非公開の環境設定・実データを別途用意'),
table(['フォルダー','位置付け'],[('docs','本資料・仕様書・構築手順書。サーバー公開不要。'),('02_release/SHA256SUMS','配布ファイルの内容を検査する照合表。'),('01_source/deploy','OS側の設定例とtimer/service。Web公開先ではなく/etc等へ設置。')],[140,WIDTH-140])),
page('1  ビルド前 → ビルド後の対応',
table(['入力（01_source）','変換・コピー先（02_release）'],[
('sakura/index.html＋main.tsx\napp/page.tsx＋globals.css\napp/lib/group-watcher-api.ts','Vite → origin/assets/main-*.js / *.css'),
('public/scheduler-entry.php＋内部生成HTML','連結 → origin/index.php。中間index.htmlとscheduler-entry.phpは配布先から除去。'),
('sakura/reservations.html＋reservations.tsx\napp/reservations-page.tsx＋reservations.css','Vite → tamanegi/index.html\nassets/reservations-*.js / *.css'),
('publicのPHP','scripts/copy-distribution-files.mjsの許可リストでorigin／tamanegiへコピー。'),
('public/m6・m7・m8.png、ロゴ','tamanegiへ原画像をコピー。og.pngはoriginへ。'),
('renkonのHTML/JS/CSS/PHP','renkonへコピー。模擬サイト用。'),
('deploy、tests、開発設定、文書生成','Web配布物に混ぜない。必要なOS設定例だけ別途転送。')],[245,WIDTH-245]),
p('JS/CSSの末尾名は内容に応じて変わります。HTML/PHP入口とassetsは同じビルドの一式を使用します。TSXを直接サーバーへ置いても動作しません。')),
page('2  開発ファイルの役割',
table(['ファイル／群（01_source）','機能・関係'],[
('app/page.tsx','予定表、管理モード、入力、ドラッグ確認、複数操作。API通信モジュールを呼ぶ。'),
('app/globals.css','内部画面、モーダル、レスポンシブ。'),
('app/lib/group-watcher-api.ts','型、日付・祝日、共有API通信。'),
('app/reservations-page.tsx\napp/reservations.css','外部3か月カレンダー、室切替、記号と画像。'),
('sakura/*.html / *.tsx','2画面のHTMLとReact起動点。'),
('vite.origin.config.ts\nvite.tamanegi.config.ts\nvite.dev.config.ts','内部・外部ビルドと開発サーバー設定。'),
('package.json / pnpm-lock.yaml\npnpm-workspace.yaml / tsconfig.json','実行コマンド、依存固定、ワークスペース、型検査。'),
('scripts/copy-distribution-files.mjs\nscripts/write-release-manifest.mjs','用途別配布と入口変換／SHA256SUMS生成。'),
('tests/rendered-html.test.mjs\ncbc-token.test.php / cbc-http.test.mjs\nscheduler-backup.test.php','構成回帰／暗号・HTTP入口／バックアップ・復元・異常時保護。'),
('scripts/build-system-docs.py','本3資料を再生成する編集可能な原稿とPDF作成処理。')],[230,WIDTH-230])),
page('3  origin：実行ファイル間の関係',
flow('index.php → runtime-config.php → portal-access.php → トークン検証','index.php内HTML → assets/main-*.js / *.css → api.php','api.php → auth.php → SQLite（app_state / audit_logs / app_meta / auth_users）','api.php または publish-availability-cli.php → availability-publisher.php','availability-json.php＋availability-room-config.php＋availability-contract.php → 公開JSON生成・HTTPS送信'),
table(['追加の内部ファイル','役割'],[
('monitor-availability-cli.php','送信遅延・失敗・再送待ちの終了コード監視。'),
('manage-auth-user-cli.php','初期管理者パスワード設定、互換アカウント保守。'),
('og.png','共有用画像。'),
('backup / restore / scheduler-backup.php','次ページの非公開バックアップ・復元処理。')],[230,WIDTH-230])),
page('4  バックアップ・復元の関係図',
flow('cron（さくら）またはbackup.timer → backup.service（Ubuntu）','backup-scheduler-cli.php → runtime-config.php → scheduler-backup.php＋auth.php','内部SQLiteを読取専用検査 → 当日以降の予定等をJSON化','JSON読み戻し・SHA-256確認 → 一時SQLiteへ復元試験','成功時だけ backups/scheduler-latest.json を置換（Web非公開）'),
p('復元時の逆方向：scheduler-latest.json → restore-scheduler-cli.php → scheduler-backup.php＋auth.php → 新規 restored.sqlite。確認後のDB設定切替は管理者が行います。公開カレンダー用JSONからは内部DBを復元できません。'),
p('backup.serviceは/etc/kptc-scheduler/internal-server.envを読みます。設定した保存先とDBはwww-dataで読み書き可能にします。バックアップJSON・.lock・復元DBはGit管理しません。')),
page('5  tamanegiとrenkonのファイル',
table(['配置先／ファイル','機能・関係'],[
('tamanegi/index.html＋assets/*','ブラウザーがpublic-availability.phpを呼び、3か月の室別空き状況を表示。'),
('tamanegi/receive-availability.php','originのPOST署名・時刻を検査し、共通検証後にJSON保存。'),
('tamanegi/availability-contract.php','スキーマ・室・期間・世代を検証、単一ファイルを安全に置換。originにも同じ原本を配布。'),
('tamanegi/public-availability.php','非公開保存領域の公開用JSONを読み、画面へ返す。'),
('tamanegi/health-availability.php','更新の鮮度をHTTP 200/503で通知。'),
('tamanegi/runtime-config.php','外部設定を読み込む。originにも共通配布。'),
('tamanegi/m6.png・m7.png・m8.png\ntechnology-center-logo-white.png','室画像とフッターロゴ。新しい室画像はID.pngで配置。'),
('renkon/index.html・styles.css\napp.js・config.js','3桁ID入力、リンク、見た目、公開カレンダーURL。'),
('renkon/open-scheduler.php\nrenkon-config.php','ID→CBC暗号化→originへ転送。鍵・内部URLを非公開設定から読む。')],[230,WIDTH-230]),
p('tamanegiにはapi.php・auth.php・SQLite・バックアップCLIを置きません。renkonは本番社内サイトを置き換えるものではありません。')),
page('6  サーバーへ配置した後の関係',
table(['領域','Ubuntu 24.04の場所'],[
('origin公開コード','/opt/kptc-scheduler/internal/current → releases/承認版'),
('origin DB','/var/lib/kptc-scheduler/group-watcher.sqlite'),
('originバックアップ','/var/lib/kptc-scheduler/backups/scheduler-latest.json'),
('origin Web設定','/etc/kptc-scheduler/internal-env.php'),
('origin定期設定','/etc/kptc-scheduler/internal-server.env → Web設定の場所を指定'),
('origin OS定期処理','/etc/systemd/system/kptc-*.service / *.timer'),
('tamanegi公開コード','/opt/kptc-scheduler/public/current → releases/承認版'),
('tamanegi公開JSON','/var/lib/kptc-availability/public-availability.json'),
('tamanegi設定','/etc/kptc-availability/public-env.php')],[143,WIDTH-143]),
p('Nginxはcurrent配下だけを公開し、許可されたPHPだけをPHP-FPMへ渡します。FPMは非公開設定を読み、www-dataとしてデータ領域へアクセスします。環境設定とデータをWeb rootの中へ置かないでください。'),
p('さくら対応：Webは/home/apfelrunner/www/GW/{schedule,calendar,renkon}。内部DBとバックアップは/home/apfelrunner/GW、公開JSONは/home/apfelrunner/GW-public。設定は/home/apfelrunner/GW/configです。')),
page('7  配布実ファイル一覧と保守範囲',
p('以下は現行02_releaseから取得した実ファイルです。assetsのハッシュ名は将来のビルドで変化します。'),
table(['配布先','実ファイル'],[(d,'\n'.join(str(p.relative_to(ROOT.parent/'02_release'/d)) for p in sorted((ROOT.parent/'02_release'/d).rglob('*')) if p.is_file())) for d in ['origin','tamanegi','renkon']],[72,WIDTH-72]))
]

# 構築手順はビルド済み配布を基本とし、コマンドを実行する機械と合格条件を明示する。
guide=[
page('独立Linuxサーバー構築・移行手順書',
p('origin＝内部予定表、tamanegi＝外部空き状況。どちらもUbuntu Server 24.04 LTSを対象とします。作業PCにある02_releaseの完成済みファイルを転送する方法が基本です。サーバー上のビルドは不要です。'),
p('本書のJSON → SQLiteという操作は「復元」と呼びます。日常バックアップの開始方法と、故障時の復元・確認・切替・切戻しを後半に掲載しました。'),
table(['章','内容'],[('1～3','準備・完成物転送・必要ソフト'),('4～8','origin配置、設定、PHP、Nginx、TLS'),('9～11','tamanegi配置・設定・PHP・Nginx'),('12～14','社内入口・初期化・移行・連携確認'),('15～16','再送・監視・毎日22時バックアップ'),('17～21','JSONからの復元、検証、世代調整、切替、再開・切戻し'),('22～24','さくらの実設定、保守、受入・障害対応'),('25','専門用語をやさしく説明')],[75,WIDTH-75]),
p('注意：DNS名・証明書・社内ネットワーク範囲・SSH管理者は組織によって異なります。これらは事前に管理担当者から受け取ってください。未確定値を推測して実行せず、エラーが出た段階で止めます。')),
page('1  開始前の確認と記入シート',
p('本書は専用の2台を想定します。既存サイトを同居させる場合、NginxやPHPの停止は他サイトに影響します。停止範囲は管理者へ確認してください。originを社外へ公開しません。'),
table(['本書の表記','事前に決める値'],[('ADMIN@origin / ADMIN@tamanegi','SSH用管理者名と接続先。以下のコマンド中で置き換える。'),('ORIGIN_FQDN / TAMANEGI_FQDN','正式なWeb用ホスト名。例のまま使わない。'),('社内の接続元','社内LAN/VPNからoriginだけへ接続を許す範囲。'),('証明書と秘密鍵','各ホスト用の証明書一式と秘密鍵のパス。組織管理者から受領。'),('2種類の共有秘密','社内ポータル↔origin用CBC鍵と、origin↔tamanegi用HMAC鍵。別々の値を使う。'),('停止時間と復旧担当','利用者への周知、設定・元DBの安全な保管場所。')],[165,WIDTH-165]),
p('コマンド欄はBash系シェルで実行します。行末のバックスラッシュ（\\）は次の行へ続く印です。sudo nanoで編集するときはCtrl+O→Enterで保存、Ctrl+Xで閉じます。秘密値をPDFやGitHubへ記録しないでください。'),
p('新規構築は3章から順番に実施。既存予定を移す場合は本番利用開始前に13章も実施。JSONから復元する場合は17章から読み、対象ファイルが本書のバックアップ形式であることを確認します。')),
page('2  作業PC：完成済みファイルを転送',
p('GitHubから承認済みmainを入手し、リポジトリの最上位で実行します。初回は空の作業フォルダーを用意してください。以下ではサーバーのホームに一時置場を作り、既存公開先へ直接上書きしません。'),
code('''git clone https://github.com/Apfelengineer/260725_GW_WEB.git
cd 260725_GW_WEB
git log -1 --oneline
cd 02_release
shasum -a 256 -c SHA256SUMS
cd ..
ssh ADMIN@origin 'mkdir -p ~/kptc-upload/origin ~/kptc-upload/deploy'
ssh ADMIN@tamanegi 'mkdir -p ~/kptc-upload/tamanegi'
rsync -av 02_release/origin/ ADMIN@origin:~/kptc-upload/origin/
rsync -av 01_source/deploy/ ADMIN@origin:~/kptc-upload/deploy/
rsync -av 02_release/tamanegi/ ADMIN@tamanegi:~/kptc-upload/tamanegi/
scp 02_release/SHA256SUMS ADMIN@origin:~/kptc-upload/
scp 02_release/SHA256SUMS ADMIN@tamanegi:~/kptc-upload/'''),
p('正常なら照合がすべてOK、転送がエラーなく終了します。Linuxの作業PCではshasum -a 256をsha256sumに読み替えます。WindowsはWSL等のBash環境を使用してください。'),
p('01_source/deployはOSの設定例6ファイル等を渡すためのものです。アプリ本体は02_releaseを使用します。renkonは本番配置不要です。再ビルドが必要な開発時だけ、01_sourceでpnpm install --frozen-lockfile、pnpm run check、pnpm test、pnpm run buildを行います。')),
page('3  両サーバー：必要ソフトと時刻',
p('originとtamanegiにSSHで入り、各サーバーで実行します。既存Webサーバーがある場合は競合を確認してから導入してください。'),
code('''sudo apt update
sudo apt install -y nginx php8.3-fpm php8.3-cli php8.3-sqlite3 \\
  php8.3-curl php8.3-mbstring sqlite3 rsync curl
sudo timedatectl set-timezone Asia/Tokyo
sudo timedatectl set-ntp true
sudo systemctl enable --now nginx php8.3-fpm
systemctl is-active nginx php8.3-fpm
php -v
php -m | grep -Ei 'sqlite3|pdo_sqlite|openssl|curl|mbstring'
timedatectl status'''),
p('正常なら両サービスがactive、PHP 8.3、sqlite3・pdo_sqlite・openssl・curl・mbstringが表示されます。tamanegiはSQLite DBを使用しませんが、手順を共通化するため同じパッケージを入れています。時刻同期が有効であることも確認します。'),
p('Nginxはページの受付係、PHP-FPMはPHPの実行係です。ブラウザーでindex.htmlを直接開く方式ではPHPは動きません。'),
p('参照：Ubuntu公式 PHP導入説明 https://ubuntu.com/server/docs/programming-php/\nUbuntu 24.04リリース情報 https://documentation.ubuntu.com/release-notes/24.04/')),
page('4  origin：完成物と非公開領域の配置',
p('originで実行。kptc-20260904を新規構築用の版名とします。同じ版のフォルダーが既にある場合は、未使用の版名へ変更してください。'),
code('''cd ~/kptc-upload
grep '^.*  origin/' SHA256SUMS | sha256sum -c -
sudo install -d -m 755 /opt/kptc-scheduler/internal/releases
sudo mkdir /opt/kptc-scheduler/internal/releases/kptc-20260904
sudo rsync -a origin/ /opt/kptc-scheduler/internal/releases/kptc-20260904/
sudo chown -R root:www-data /opt/kptc-scheduler/internal/releases/kptc-20260904
sudo find /opt/kptc-scheduler/internal/releases/kptc-20260904 \\
  -type d -exec chmod 750 {} \\;
sudo find /opt/kptc-scheduler/internal/releases/kptc-20260904 \\
  -type f -exec chmod 640 {} \\;
sudo ln -s /opt/kptc-scheduler/internal/releases/kptc-20260904 \\
  /opt/kptc-scheduler/internal/current
sudo install -d -o www-data -g www-data -m 700 /var/lib/kptc-scheduler
sudo install -d -o www-data -g www-data -m 700 /var/lib/kptc-scheduler/backups
sudo install -d -o root -g www-data -m 750 /etc/kptc-scheduler
ls -l /opt/kptc-scheduler/internal/current'''),
p('正常ならすべての照合がOK、currentが今回の版を指します。lnで「既に存在」が出たら上書きせず、更新作業として旧版の行先を記録してから23章に従います。DB・JSON・秘密設定はcurrentの外へ置きます。')),
page('5  origin：非公開設定ファイル',
p('originで sudo nano /etc/kptc-scheduler/internal-env.php を開き、以下を保存します。ホスト名と2種類の鍵は置き換えてください。鍵はそれぞれopenssl rand -hex 32で生成し、対応する相手側だけへ同じ値を設定します。'),
code('''<?php
putenv('KPTC_INTERNAL_SCHEDULER_DB=/var/lib/kptc-scheduler/group-watcher.sqlite');
putenv('KPTC_SCHEDULER_BACKUP_JSON=/var/lib/kptc-scheduler/backups/scheduler-latest.json');
putenv('KPTC_PORTAL_TOKEN_KEY=REPLACE_PORTAL_SECRET');
putenv('KPTC_PUBLIC_AVAILABILITY_MODE=https');
putenv('KPTC_PUBLIC_AVAILABILITY_ENDPOINT=https://TAMANEGI_FQDN/receive-availability.php');
putenv('KPTC_PUBLIC_AVAILABILITY_PAGE_URL=https://TAMANEGI_FQDN/');
putenv('KPTC_PUBLIC_AVAILABILITY_SECRET=REPLACE_PUBLISH_SECRET');
putenv('KPTC_PUBLIC_AVAILABILITY_TIMEOUT=10');
putenv('KPTC_SESSION_COOKIE_SECURE=1');'''),
code('''sudo chown root:www-data /etc/kptc-scheduler/internal-env.php
sudo chmod 640 /etc/kptc-scheduler/internal-env.php
sudo php -l /etc/kptc-scheduler/internal-env.php'''),
p('正常ならNo syntax errors。設定値はブラウザーやログに出さないでください。Web用PHPと定期実行は同じ設定を読む構成にし、DB切替時の変更漏れを防ぎます。'),
p('KPTC_PORTAL_TOKEN_KEYは社内サイト側と共有。KPTC_PUBLIC_AVAILABILITY_SECRETはtamanegi側と共有（32文字以上）。この2つを混同しないでください。')),
page('6  origin：PHP-FPMの専用設定',
p('originで sudo nano /etc/php/8.3/fpm/pool.d/kptc-origin.conf を開き、以下を保存します。'),
code('''[kptc-origin]
user = www-data
group = www-data
listen = /run/php/php8.3-fpm-kptc-origin.sock
listen.owner = www-data
listen.group = www-data
pm = ondemand
pm.max_children = 8
pm.process_idle_timeout = 10s
clear_env = yes
env[KPTC_INTERNAL_CONFIG_FILE] = /etc/kptc-scheduler/internal-env.php
php_admin_value[session.save_path] = /var/lib/kptc-scheduler/sessions'''),
code('''sudo install -d -o www-data -g www-data -m 700 /var/lib/kptc-scheduler/sessions
sudo php-fpm8.3 -t
sudo systemctl restart php8.3-fpm
ls -l /run/php/php8.3-fpm-kptc-origin.sock'''),
p('正常なら設定検査がsuccessfulで、専用socketが表示されます。sessionsはこのアプリ専用にします。障害復旧時に他サイトのログイン状態を巻き込まず、新しい空の保存先へ切り替えられます。'),
p('PHPファイルを静的ファイルとして配信すると秘密や内部処理が漏れます。次章で許可する入口だけをPHPとして実行してください。')),
page('7  origin：NginxとHTTPS',
p('正式証明書を管理者に用意してもらい、/etc/ssl/kptc/origin-fullchain.pemとorigin-key.pemへ安全に配置します。秘密鍵はrootのみ読める600にします。以下は専用ホストの例で、URLは https://ORIGIN_FQDN/ です。'),
p('sudo nano /etc/nginx/sites-available/kptc-origin で保存：'),
code('''server {
  listen 80;
  server_name ORIGIN_FQDN;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl;
  server_name ORIGIN_FQDN;
  ssl_certificate /etc/ssl/kptc/origin-fullchain.pem;
  ssl_certificate_key /etc/ssl/kptc/origin-key.pem;
  root /opt/kptc-scheduler/internal/current;
  index index.php;
  access_log off;
  location / { try_files $uri $uri/ /index.php?$query_string; }
  location ~ ^/(index|api)\\.php$ {
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:/run/php/php8.3-fpm-kptc-origin.sock;
  }
  location ~ \\.php$ { return 404; }
  location ~ /\\. { deny all; }
}'''),
p('入口はindex.htmlではなくindex.phpです。access_log offはURLのtokenが通常のアクセスログへ残ることを避ける例です。上流プロキシやブラウザー履歴等に残る可能性は別途対策が必要です。')),
page('8  origin：公開範囲と動作確認',
p('ネットワーク管理者と、originの443を社内LAN/VPNだけから許可する設定を先に行います。SSHは管理端末だけに制限します。DNSに名前を登録しないことだけでは遮断になりません。TLSの証明書警告が出る場合は無視せず修正してください。'),
code('''sudo ln -s /etc/nginx/sites-available/kptc-origin \\
  /etc/nginx/sites-enabled/kptc-origin
sudo nginx -t
sudo systemctl reload nginx
curl -I https://ORIGIN_FQDN/
curl -I https://ORIGIN_FQDN/backup-scheduler-cli.php'''),
p('正常ならNginx設定検査はsuccessful、トークンなしの予定表は403、CLIのURLは404です。403は今回の入口保護の正常動作です。200の予定表表示は12章の社内ポータル経由で確認します。'),
p('すでに同名のsites-enabledリンクがある場合は新規lnを繰り返さず、既存の指す先を確認します。PHPのソースが文字として表示される場合は直ちに公開停止し、PHP設定を見直してください。')),
page('9  tamanegi：完成物とデータ領域',
p('tamanegiで実行します。こちらには内部DBもバックアップJSONも転送しません。'),
code('''cd ~/kptc-upload
grep '^.*  tamanegi/' SHA256SUMS | sha256sum -c -
sudo install -d -m 755 /opt/kptc-scheduler/public/releases
sudo mkdir /opt/kptc-scheduler/public/releases/kptc-20260904
sudo rsync -a tamanegi/ /opt/kptc-scheduler/public/releases/kptc-20260904/
sudo chown -R root:www-data /opt/kptc-scheduler/public/releases/kptc-20260904
sudo find /opt/kptc-scheduler/public/releases/kptc-20260904 \\
  -type d -exec chmod 750 {} \\;
sudo find /opt/kptc-scheduler/public/releases/kptc-20260904 \\
  -type f -exec chmod 640 {} \\;
sudo ln -s /opt/kptc-scheduler/public/releases/kptc-20260904 \\
  /opt/kptc-scheduler/public/current
sudo install -d -o www-data -g www-data -m 700 /var/lib/kptc-availability
sudo install -d -o root -g www-data -m 750 /etc/kptc-availability'''),
p('正常なら照合OK、currentが新しい版を指します。公開JSONは初回送信時に自動生成されるため、この時点で無くても構いません。さくらの公開JSONを手で持ち込む必要はありません。')),
page('10  tamanegi：非公開設定とPHP',
p('sudo nano /etc/kptc-availability/public-env.php で保存。送信鍵はoriginと同じ実値にします。'),
code('''<?php
putenv('KPTC_PUBLIC_AVAILABILITY_JSON=/var/lib/kptc-availability/public-availability.json');
putenv('KPTC_PUBLIC_AVAILABILITY_SECRET=REPLACE_PUBLISH_SECRET');
putenv('KPTC_PUBLIC_AVAILABILITY_STALE_SECONDS=1800');'''),
code('''sudo chown root:www-data /etc/kptc-availability/public-env.php
sudo chmod 640 /etc/kptc-availability/public-env.php
sudo php -l /etc/kptc-availability/public-env.php'''),
p('sudo nano /etc/php/8.3/fpm/pool.d/kptc-tamanegi.conf で保存：'),
code('''[kptc-tamanegi]
user = www-data
group = www-data
listen = /run/php/php8.3-fpm-kptc-tamanegi.sock
listen.owner = www-data
listen.group = www-data
pm = ondemand
pm.max_children = 8
clear_env = yes
env[KPTC_PUBLIC_CONFIG_FILE] = /etc/kptc-availability/public-env.php'''),
code('''sudo php-fpm8.3 -t
sudo systemctl restart php8.3-fpm'''),
p('正常なら設定検査successful。外部側にDB設定を追加しないでください。')),
page('11  tamanegi：NginxとHTTPS',
p('tamanegi用証明書を同様に配置し、sudo nano /etc/nginx/sites-available/kptc-tamanegi で以下を保存します。'),
code('''server {
  listen 80;
  server_name TAMANEGI_FQDN;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl;
  server_name TAMANEGI_FQDN;
  ssl_certificate /etc/ssl/kptc/tamanegi-fullchain.pem;
  ssl_certificate_key /etc/ssl/kptc/tamanegi-key.pem;
  root /opt/kptc-scheduler/public/current;
  index index.html;
  location / { try_files $uri $uri/ =404; }
  location ~ ^/(receive-availability|public-availability|health-availability)\\.php$ {
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:/run/php/php8.3-fpm-kptc-tamanegi.sock;
  }
  location ~ \\.php$ { return 404; }
  location ~ /\\. { deny all; }
}'''),
code('''sudo ln -s /etc/nginx/sites-available/kptc-tamanegi \\
  /etc/nginx/sites-enabled/kptc-tamanegi
sudo nginx -t
sudo systemctl reload nginx
curl -I https://TAMANEGI_FQDN/
curl -i https://TAMANEGI_FQDN/health-availability.php'''),
p('正常ならトップ200。初回送信前のhealth 503は想定内です。証明書の更新は組織の管理方法に従ってください。')),
page('12  社内サイトの入口と一般モード',
p('実運用では既存の社内サイトの認証後に、02_release/renkon/open-scheduler.php相当の処理を組み込みます。ログイン済み利用者の3桁IDを組織側で決定してください。利用者が任意IDを入力できるrenkonは模擬用で、本番本人確認には使いません。'),
table(['項目','連携仕様'],[('入力','user_001 のように user_＋半角数字3桁'),('暗号','AES-256-CBC、元鍵をhash(sha256, 元鍵, true)で32バイト化'),('IV','毎回ランダム16バイト。IVと暗号文を連結してBase64化'),('転送','https://ORIGIN_FQDN/?token= にURLエンコードした結果を付ける'),('設定','両側のKPTC_PORTAL_TOKEN_KEYを一致させる。模擬renkonの内部URLはKPTC_RENKON_SCHEDULER_URLで指定'),('公開リンク','tamanegi URLは認証トークン不要。模擬renkonではconfig.jsで変更')],[100,WIDTH-100]),
p('正常なら社内サイトから一般モードの予定表が開きます。新規構築ではデモデータが作成されるため、本番利用前に管理者モードで内容を確認・整理します。旧環境のデータを使用する場合は13章を先に完了してください。'),
p('CBC形式だけでは改ざん検出・期限・本人との照合はありません。鍵の保護、認証済みの社内入口、社内ネットワーク制限をセットで運用します。URLに実名やパスワードを含めないでください。')),
page('13  既存データの移行と初期管理者',
p('過去予定も含めて移行する場合は旧環境のSQLiteを正規の.backupで複製します。運用中の.sqliteだけをcpするとWAL内の変更を取りこぼす可能性があります。旧環境への予定入力と定期送信を停止し、移行用コピーが完成するまで再開しないでください。'),
    code('''sqlite3 /PRIVATE_PATH/group-watcher.sqlite \\
  ".backup '/PRIVATE_PATH/migration.sqlite'"
sqlite3 /PRIVATE_PATH/migration.sqlite 'PRAGMA integrity_check;'
'''),
p('PRIVATE_PATHは旧環境の実際の非公開パスへ置換します。結果がokであることを確認し、migration.sqliteをSSH/SFTPでoriginの非公開作業領域へ転送します。所有者www-data・権限600で/var/lib/kptc-schedulerへ配置し、既存ファイルへ上書きせず、5章のDB設定を移行ファイルの絶対パスへ変更してください。JSONのみから移す場合は17章の復元手順を使います。'),
p('originでDBを準備した後、初期管理者モードのパスワードを設定します。初期設定が既にある移行DBでは、変更が必要な場合だけ行います。'),
code('''sudo -u www-data env \\
  KPTC_INTERNAL_CONFIG_FILE=/etc/kptc-scheduler/internal-env.php \\
  php /opt/kptc-scheduler/internal/current/manage-auth-user-cli.php \\
  set-admin-mode-password'''),
p('8～128文字を対話入力します。以後は画面の管理者モードで変更できます。JSONには設定ファイル・鍵・画像は含まれないため、別途移行します。\n参照：SQLite公式 https://www.sqlite.org/backup.html')),
page('14  連携の手動試験',
p('originで実行します。tamanegiへのHTTPS接続、同じHMAC鍵、両サーバーの時刻同期が必要です。'),
code('''sudo -u www-data env \\
  KPTC_INTERNAL_CONFIG_FILE=/etc/kptc-scheduler/internal-env.php \\
  php /opt/kptc-scheduler/internal/current/publish-availability-cli.php
echo $?
curl -i https://TAMANEGI_FQDN/health-availability.php'''),
p('正常なら送信の終了コード0、healthはHTTP 200。公開画面でm6・m7・m8の当月から3か月を確認します。社内予定表に確認用予約を1件登録し、表示を確認後にその確認用予定を削除してください。'),
table(['試験','合格条件'],[('13～17時だけ機器利用','▲：午前のみ予約可'),('9～12時だけ機器利用','▼：午後のみ予約可'),('両時間帯の機器利用','濃灰、日付黒、記号なし'),('機器点検','ー、日付なし'),('公開情報','個人名、件名、メモが含まれていない')],[190,WIDTH-190]),
p('origin側の試験に失敗したら、バックアップ定期実行を有効にする前に解決してください。公開JSONは内部DBの代用にも復元用にも使えません。')),
page('15  origin：再送・監視・バックアップを登録',
p('sudo nano /etc/kptc-scheduler/internal-server.env で以下の1行を保存します。すべてのCLIがWebと同じPHP設定を読み、秘密やDBパスの二重管理を避けます。既存設定を移す場合は古い重複値を整理してから使用してください。'),
code('''KPTC_INTERNAL_CONFIG_FILE=/etc/kptc-scheduler/internal-env.php'''),
code('''sudo chown root:root /etc/kptc-scheduler/internal-server.env
sudo chmod 600 /etc/kptc-scheduler/internal-server.env
sudo cp ~/kptc-upload/deploy/kptc-availability-publish.service /etc/systemd/system/
sudo cp ~/kptc-upload/deploy/kptc-availability-publish.timer /etc/systemd/system/
sudo cp ~/kptc-upload/deploy/kptc-availability-monitor.service /etc/systemd/system/
sudo cp ~/kptc-upload/deploy/kptc-availability-monitor.timer /etc/systemd/system/
sudo cp ~/kptc-upload/deploy/kptc-scheduler-backup.service /etc/systemd/system/
sudo cp ~/kptc-upload/deploy/kptc-scheduler-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kptc-availability-publish.timer
sudo systemctl enable --now kptc-availability-monitor.timer
sudo systemctl enable --now kptc-scheduler-backup.timer
systemctl list-timers --all 'kptc-*'
'''),
p('正常なら送信5分、監視10分、バックアップ日本時間22時の次回実行が表示されます。バックアップtimerはPersistent=trueのため、停止中に22時を過ぎた場合は次の起動後に実行します。'),
p('Ubuntuのserviceはwww-data、/usr/bin/php、/opt/.../internal/current、/etc/kptc-scheduler/internal-server.envを使用します。別配置にする場合は同梱serviceのパスも変更します。')),
page('16  初回バックアップと日常確認',
p('originで手動実行して成功を確認します。自動実行の設定と同じserviceを使うため、権限や保存先も合わせて試験できます。'),
code('''sudo systemctl start kptc-scheduler-backup.service
sudo journalctl -u kptc-scheduler-backup.service -n 20 --no-pager
sudo ls -l /var/lib/kptc-scheduler/backups/scheduler-latest.json
systemctl list-timers --all kptc-scheduler-backup.timer'''),
p('正常ならログのokがtrue、fromDateが日本時間の実行日、schedulesが保存件数です。ファイルは所有者www-data、権限-rw-------。翌日の実行後にcreatedAtの更新も確認してください。登録だけでは自動実行の成功を証明しません。'),
p('当日以降に終了する予定を全件保存し、未来の期限はありません。継続中の複数日予定も含みます。ユーザー・試験室・種別・互換アカウント・管理者パスワードハッシュも保存します。過去予定・履歴は対象外ですが本番DBからは消しません。'),
p('保存は毎回1ファイルへ安全に置換します。壊れたDBや不正データでは旧正常JSONを保持します。公開用JSONではなく機密のバックアップなので、tamanegiやGitHubへ置かないでください。.lockは排他制御に必要で、削除しません。'),
p('同じサーバー自体の故障、正常な操作による誤削除の翌日保存、意味上の誤りには限界があります。別媒体への退避は組織で別途実施してください。メール通知・自動別媒体複製は本機能にありません。')),
page('17  障害復旧：最初に停止して保護',
p('実行場所：origin。利用者へ停止を連絡し、社内ポータルからの新規アクセスを一時停止します。以下は専用サーバー用です。共用サーバーでは全PHP停止を行わず、担当者が対象poolと経路だけを停止してください。'),
code('''sudo systemctl stop kptc-scheduler-backup.timer
sudo systemctl stop kptc-availability-publish.timer kptc-availability-monitor.timer
sudo systemctl stop kptc-scheduler-backup.service
sudo systemctl stop kptc-availability-publish.service kptc-availability-monitor.service
sudo systemctl stop php8.3-fpm
sudo systemctl is-active php8.3-fpm
sudo ls -l /var/lib/kptc-scheduler/backups/scheduler-latest.json'''),
p('正常ならPHPはinactive。バックアップの更新日時が復元したい時点であることを確認します。異常の原因が分からない間はbackupを再実行しないでください。翌日の置換で復旧元を失う恐れがあります。'),
p('次に、元DB、-wal／-shmがあればそれら、設定、バックアップJSONを非公開の障害保全先へコピーします。下記の場所は新規名であることを確認し、既存なら別名を使います。障害保全用コピーは通常の日次世代とは別の臨時保全です。'),
code('''sudo mkdir -m 700 /var/lib/kptc-scheduler/recovery-20260904
sudo cp -p /var/lib/kptc-scheduler/backups/scheduler-latest.json \\
  /var/lib/kptc-scheduler/recovery-20260904/
sudo cp -p /etc/kptc-scheduler/internal-env.php \\
  /var/lib/kptc-scheduler/recovery-20260904/'''),
p('元DBパスはinternal-env.phpの実値を確認して保全してください。元DBは削除せず、この後は新しいファイルへ復元します。')),
page('18  JSONから新しいSQLiteを作成',
p('originで実行。復元先group-watcher-restored-20260904.sqliteがまだ存在しないことを確認してください。同名があれば別の未使用名に変えます。元のgroup-watcher.sqliteを指定しません。'),
code('''sudo -u www-data php \\
  /opt/kptc-scheduler/internal/current/restore-scheduler-cli.php \\
  /var/lib/kptc-scheduler/backups/scheduler-latest.json \\
  /var/lib/kptc-scheduler/group-watcher-restored-20260904.sqlite
echo $?
sudo -u www-data sqlite3 \\
  /var/lib/kptc-scheduler/group-watcher-restored-20260904.sqlite \\
  'PRAGMA integrity_check;'
sudo -u www-data sqlite3 \\
  /var/lib/kptc-scheduler/group-watcher-restored-20260904.sqlite \\
  "SELECT json_array_length(payload,'$.schedules'),version FROM app_state;"'''),
p('正常なら「本番DBは変更していません」と表示され、終了コード0、整合性はokです。最後の行は予定件数と更新世代です。復元はバックアップのJSON形式・照合値を確認してから実施され、既存ファイルへの上書きは拒否します。'),
p('この時点では新しいDBを作っただけで、予定表はまだ元DB設定のままです。JSONは手で編集しないでください。公開側のpublic-availability.jsonには復元に必要な予定情報がないため使用できません。'),
p('復元できるのはバックアップ作成時点の対象予定・マスター・アカウント・管理者設定です。過去に終了した予定と操作履歴は戻りません。期間を過ぎてから復元しても、JSONに含まれる内容をそのまま戻します。')),
page('19  内容確認と公開世代の調整',
p('originの復元DBを確認します。以下の表示には個人名や予定件名を出さず、件数だけを確認します。'),
code('''sudo -u www-data sqlite3 \\
  /var/lib/kptc-scheduler/group-watcher-restored-20260904.sqlite \\
  "SELECT json_array_length(payload,'$.members'),
          json_array_length(payload,'$.categories') FROM app_state;"
sudo -u www-data sqlite3 \\
  /var/lib/kptc-scheduler/group-watcher-restored-20260904.sqlite \\
  'SELECT count(*) FROM auth_users; SELECT count(*) FROM audit_logs;'
'''),
p('正常ならユーザー・種別・互換アカウント件数が想定どおり、履歴は0件。管理者パスワードは保存時のものへ戻ります。'),
p('tamanegiで現在の公開JSONのsourceVersionを読みます。公開側を削除して解決しないでください。'),
code('''sudo -u www-data php -r \\
  '$p=json_decode(file_get_contents($argv[1]),true,512,JSON_THROW_ON_ERROR);
   echo $p["sourceVersion"],PHP_EOL;' \\
  /var/lib/kptc-availability/public-availability.json'''),
p('originへ戻り、復元DBのversionと公開sourceVersionの大きい方に1を加えた値を使用します。例：復元100、公開125なら126。次の126は実際の計算値に置き換えてください。公開JSONが初回未生成なら復元version＋1でよいです。'),
code('''sudo -u www-data sqlite3 \\
  /var/lib/kptc-scheduler/group-watcher-restored-20260904.sqlite \\
  'UPDATE app_state SET version=126 WHERE id=1;'
'''),
p('これは復元直後の古い世代が外部受信で拒否されないための処置です。作業中は送信処理を停止したままにします。')),
page('20  設定を切替・公開情報を再生成',
p('originで sudo nano /etc/kptc-scheduler/internal-env.php を開き、DB指定の1行だけを新規復元DBへ変更します。他の秘密設定を変更しません。'),
code('''putenv('KPTC_INTERNAL_SCHEDULER_DB=/var/lib/kptc-scheduler/group-watcher-restored-20260904.sqlite');'''),
p('長い行ですが、PHP設定では1行として保存します。既存セッションを持ち越さないよう、専用の新しい空フォルダーを用意します。'),
code('''sudo install -d -o www-data -g www-data -m 700 \\
  /var/lib/kptc-scheduler/sessions-restored-20260904
sudo nano /etc/php/8.3/fpm/pool.d/kptc-origin.conf'''),
p('pool内のsession.save_pathの行を以下へ変更します。元の行と元DBパスを切戻し用に控えておきます。'),
code('''php_admin_value[session.save_path] = /var/lib/kptc-scheduler/sessions-restored-20260904'''),
code('''sudo php -l /etc/kptc-scheduler/internal-env.php
sudo php-fpm8.3 -t
sudo -u www-data env \\
  KPTC_INTERNAL_CONFIG_FILE=/etc/kptc-scheduler/internal-env.php \\
  php /opt/kptc-scheduler/internal/current/publish-availability-cli.php
curl -i https://TAMANEGI_FQDN/health-availability.php
sudo systemctl start php8.3-fpm'''),
p('正常なら送信終了コード0、health 200。利用者は社内ポータルから入り直します。公開側に古い更新世代エラーが出たら19章を再確認し、失敗したまま再開しないでください。')),
page('21  復旧確認・定期処理再開・切戻し',
p('社内ポータル経由で予定表を開き、予定・ユーザー・試験室・種別を確認します。管理者モードへ保存時のパスワードで切替できること、確認用予定の登録・編集・削除ができること、空き状況へ反映されることを確認します。確認用予定は終了後に削除します。'),
code('''sudo systemctl start kptc-availability-publish.timer
sudo systemctl start kptc-availability-monitor.timer
sudo systemctl start kptc-scheduler-backup.timer
systemctl list-timers --all 'kptc-*'
sudo journalctl -u kptc-availability-publish.service -n 20 --no-pager'''),
p('バックアップtimerは取り逃し分を直ちに実行することがあります。復旧元を保全した17章が完了し、復元内容が正しいと確認した後に再開してください。通常の最新JSONは次の成功時に置換されます。'),
p('問題がある場合：再び入力と3つのtimer/service、PHPを停止し、internal-env.phpのDBパスを元の非公開DBへ戻します。元DB自体が破損している場合は戻さず停止を継続してください。復旧中に公開情報を更新した場合、元DBにも19章の世代調整を行ってから再送します。'),
p('新しい空のsession.save_pathはそのまま使い、旧セッションを復活させないでください。設定検査→再送→画面確認→定期処理再開の順です。復元後に入力された変更は元DBへ自動では戻らないため、切戻し前に担当者が扱いを決めます。'),
p('元DB・障害保全コピーは障害原因と復旧結果が確定するまで削除しません。通常の「日次バックアップは1世代」と、事故時の一時保全は分けて扱います。')),
page('22  さくら環境：現状と復元時の違い',
p('2026年9月4日時点で下記を登録済みです。サーバー時刻はJST。既存の送信・監視は変更せず、バックアップを追加しています。'),
code('''*/5 * * * * /home/apfelrunner/GW/bin/publish-availability \\
  >/home/apfelrunner/GW/publish-availability.log 2>&1
*/10 * * * * /home/apfelrunner/GW/bin/monitor-availability \\
  >/home/apfelrunner/GW/monitor-availability.log 2>&1
0 22 * * * /usr/local/bin/php /home/apfelrunner/www/GW/schedule/backup-scheduler-cli.php \\
  >/home/apfelrunner/GW/scheduler-backup.log 2>&1'''),
p('上の枠は読みやすく折り返しています。crontabでは各ジョブを改行せず1行で登録します。既に登録済みなので重複追加は不要です。初回手動実行は23件・8,036バイト、保存・復元検証成功。翌日以降はログと更新日時を確認します。'),
table(['用途','実パス'],[('実DB','/home/apfelrunner/GW/group-watcher.sqlite'),('バックアップ','/home/apfelrunner/GW/backups/scheduler-latest.json'),('内部設定','/home/apfelrunner/GW/config/internal-env.php'),('復元CLI','/home/apfelrunner/www/GW/schedule/restore-scheduler-cli.php'),('PHP','/usr/local/bin/php')],[90,WIDTH-90]),
p('さくらではsystemctlを使いません。利用停止・対象cronの一時コメント化・進行中処理の終了確認を行い、上記CLIへJSONと未使用の非公開SQLiteパスを指定します。内容検証・世代調整・DB設定切替は17～21章と同じ考え方です。共有PHP全体は停止せず、対象サイトだけの停止方法を管理者と確認してください。')),
page('23  更新・試験室追加・画像差替',
p('更新は新しいreleases/版名へ完成物一式を転送し、照合・PHP検査後にcurrentを切り替えます。旧版と設定・DBはそのまま残し、公開フォルダーと非公開データ領域をまとめて削除しないでください。'),
    code('''sudo ln -sfn /opt/kptc-scheduler/internal/releases/NEW_RELEASE \\
  /opt/kptc-scheduler/internal/current
sudo systemctl reload php8.3-fpm'''),
p('NEW_RELEASEは実際に配置済みのフォルダー名へ置換します。戻す場合はcurrentを記録済みの旧版へ変更します。コードの切替だけではDBは元に戻りません。'),
p('試験室追加：①管理者モードで所属「試験室」のユーザー作成、②availability-room-config.phpの許可IDに追記、③必要な公開名・説明を設定、④originへ設定PHPを反映、⑤tamanegiへID.pngを配置、⑥手動送信と公開画面確認。公開許可と画像使用許可を先に得てください。'),
p('画像は同名ファイルを差し替えれば変更できます。m6.png・m7.png・m8.pngは現行200×200ピクセル。縦横比を揃えた正方形を基本とし、重要部分を中央へ置きます。ブラウザーのキャッシュで古い画像が見える場合は再読込してください。'),
p('新releaseへ切替える前に、サーバーだけにある追加室画像・差替画像を引き継ぎます。既存のユーザー作成画像をビルド画像で意図せず上書きしないよう、差分を見て選びます。秘密設定・鍵・画像の別媒体保管は日次JSONとは別に必要です。')),
page('24  受入確認と困ったとき',
table(['確認／症状','合格条件・最初の確認'],[('入口','トークンなし403、正規社内入口で予定表、CBC鍵一致。'),('管理','一般は予定編集可、管理者パスワードで管理項目が使える。'),('予定操作','今週、7日表示、休日、長い室名、D&Dの確認・取消、複数操作。'),('公開連携','正しい3か月・許可室・記号、個人情報なし、health 200。'),('定期処理','送信・監視・バックアップの3timerを確認し、実行後のログも確認。'),('バックアップ','private JSONの時刻・件数・600権限。別名SQLiteへの復元がok。'),('PHP/画面不調','nginx -t、php-fpm8.3 -t、サービス、socket、index.php/HTMLとassets。'),('保存不可','DBと親フォルダーのwww-data権限、空き容量、APIの409競合。'),('送信失敗/503','URL、HMAC鍵、時刻差、送信ログ、JSONの鮮度・権限。'),('復元失敗','JSON種類・照合値、既存復元先、SQLite拡張、書込権限。前回正常JSONは編集しない。'),('復元後409','公開sourceVersionより復元DBのversionが古くないか19章で確認。')],[116,WIDTH-116]),
code('''sudo journalctl -u php8.3-fpm -n 30 --no-pager
sudo journalctl -u kptc-availability-monitor.service -n 30 --no-pager
sudo journalctl -u kptc-scheduler-backup.service -n 30 --no-pager'''),
p('本書のUbuntu構成は配置用の例です。コード・復元機能はローカルとさくらで検証済みですが、origin/tamanegi実機での新規構築・受入試験は現地担当者が実施してください。')),
page('25  用語集：機械・通信・公開',
table(['言葉','やさしい説明'],[('サーバー','ほかの人からの要求を受け、画面や情報を渡すコンピューター。'),('内部／外部','組織の中だけで使う範囲／インターネットから見られる範囲。'),('OS・Ubuntu・Linux','機械全体を動かす基本のソフト。UbuntuはLinuxの仲間。24.04は版の名前。'),('ブラウザー','SafariやChromeなど、Webページを見るソフト。'),('URL・ドメイン・FQDN','Webの場所を示す宛先／機械の読みやすい名前／省略しない正式名。'),('IPアドレス・DNS','機械の数字の住所／名前から数字の住所を調べる住所録。'),('LAN・VPN','近くの機械を結ぶ網／離れた場所から組織の網へ安全につなぐ道。'),('ポート・443・22','用途別の入口番号。443は暗号化したWeb、22は遠隔操作で主に使う。'),('HTTPS・TLS・証明書','通信を読まれにくくし相手を確かめる仕組み／その仕組み／相手の電子的な名札。'),('SSH・SFTP','離れた機械を安全に操作する方法／安全にファイルを送る方法。'),('Nginx・PHP-FPM','Web要求の受付係／PHPで書かれた処理を実行する係。'),('socket・pool','プログラム同士をつなぐ連絡口／PHPの仕事を担当するまとまり。')],[142,WIDTH-142])),
page('25  用語集：ファイル・設定・操作',
table(['言葉','やさしい説明'],[('ターミナル・シェル・Bash','文字で命令する画面／命令を読む係／その係の一種。'),('コマンド・CLI','文字で書く命令／文字の命令で使う入口。'),('sudo・root・www-data','管理者の力で実行する命令／管理者／Web処理用の利用者名。'),('権限600・700・640','600は所有者だけ読書き、700は所有者だけ使えるフォルダー、640は所有者が読書きし指定の仲間は読むだけ。'),('フォルダー・パス','ファイルをまとめる入れ物／その入れ物やファイルの場所を表す文字列。'),('環境変数・設定ファイル','場所ごとに変える保存先や宛先などの値／その値をまとめたファイル。'),('アップロード・rsync・scp','ファイルを送ること／差を確かめて送る道具／安全にコピーして送る道具。'),('ソース・TS/TSX・React','人が編集する元のプログラム／画面の動きを書く言葉／画面部品を作る仕組み。'),('ビルド・Vite・Node.js・pnpm','元を実行用に作り替えること／変換の道具／開発用処理を動かす道具／必要部品をそろえる道具。'),('release・current・リンク','配布する版／今使う版の目印／別の場所へ案内する近道。'),('GitHub・main','プログラムの変更を保管するサービス／この案件で正式版をまとめる場所。'),('キャッシュ','前に受け取った画像などを近くに保存して、次を速くする仕組み。')],[142,WIDTH-142])),
page('25  用語集：データ・認証・復旧',
table(['言葉','やさしい説明'],[('DB・SQLite・テーブル','整理して情報を置く箱／ファイルで管理するDB／DB内で同じ種類をまとめた表。'),('JSON・schema','名前と値を文字で並べる保存形式／その形式の決まり。'),('バックアップ・復元','予備の写しを作ること／写しを使って使える状態へ戻すこと。'),('整合性・SHA-256','データのつじつまが合うこと／内容から作る照合用の数字と文字。'),('原子的置換・ロック','完成品を一度で入れ替える方法／同時に同じ作業をしないための使用中の印。'),('WAL・トランザクション','DB本体に反映前の変更記録／複数の処理をまとめて成功か失敗かにする単位。'),('version・sourceVersion','更新の順番を表す番号。新旧を取り違えないために使う。'),('CBC・IV・Base64','暗号の作り方／毎回変える暗号用の出発値／データを文字で運べる形にする方法。'),('token・セッション・Cookie','入口へ渡す文字情報／利用中の状態を覚える仕組み／ブラウザーが持つ小さな目印。'),('HMAC・共通鍵・CSRF','秘密を共有する相手の印／双方が持つ秘密の文字列／別サイトから本人の意図なしに操作させる攻撃。'),('cron・systemd・timer・service','時刻で動かす仕組み／Ubuntuの仕事管理係／開始の時計／仕事本体。'),('ログ・終了コード・切戻し','起きたことの記録／成功失敗を示す番号／問題前の構成へ戻すこと。')],[142,WIDTH-142]),
p('迷ったら、どの機械で、どのファイルを、何のために変更するのかを確認してください。値が分からないまま命令を実行しないことが、安全な復旧への近道です。'))
]

if __name__=='__main__':
    render('KPTC_Scheduler_現行アプリケーション仕様書.pdf','現行仕様書',spec)
    render('KPTC_Scheduler_ファイル機能・役割一覧_関係図.pdf','ファイル関係図',relations)
    render('KPTC_Scheduler_独立Linuxサーバー構築・移行手順書.pdf','Ubuntu 24.04 構築・復元',guide)

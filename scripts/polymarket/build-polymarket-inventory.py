#!/usr/bin/env python3
"""Build a static evidence and local-MVP workbook from saved inputs. No network calls."""
from pathlib import Path
from datetime import datetime, timezone
import json, hashlib, os, tempfile, math, struct, re
import xlsxwriter
os.environ.setdefault('MPLCONFIGDIR', tempfile.mkdtemp(prefix='polymarket-mpl-'))
os.environ.setdefault('XDG_CACHE_HOME', tempfile.mkdtemp(prefix='polymarket-cache-'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/polymarket'
EVIDENCE = DOCS / 'evidence' / '2026-09-08'
MVP_EVIDENCE = DOCS / 'evidence' / '2026-09-09'
SCREENSHOTS = DOCS / 'screenshots'
load = lambda name: json.loads((EVIDENCE / (name + '.json')).read_text())
manifest = load('manifest')
requests = {x['id']: x for x in manifest}
for req in manifest:
    assert hashlib.sha256((EVIDENCE / req['file']).read_bytes()).hexdigest() == req['sha256']
event, market, bbo, book = load('event-fed')['event'], load('market-fed')['market'], load('bbo-fed')['marketData'], load('book-fed')['marketData']
history = load('history-fed-1d')['history']
weekly = load('history-fed-1w')['history']
captures = load('screenshots')
mvp_captures = [capture for capture in captures if 'polymarket-mvp-' in capture['file']]
mvp_market_file = MVP_EVIDENCE / 'mvp-market.json'
mvp_validation_file = MVP_EVIDENCE / 'mvp-validation.json'
mvp_response = json.loads(mvp_market_file.read_text()) if mvp_market_file.exists() else None
mvp_validation = json.loads(mvp_validation_file.read_text()) if mvp_validation_file.exists() else None
mvp_history = None
mvp_points = []
mvp_response_sha256 = None
if mvp_response is not None:
    assert isinstance(mvp_response, dict), 'MVP response must be the normalized local market-response object'
    mvp_history = mvp_response.get('history')
    assert mvp_history is None or isinstance(mvp_history, dict), 'Unexpected MVP history shape'
    mvp_points = mvp_history.get('points', []) if mvp_history else []
    assert isinstance(mvp_points, list), 'MVP history.points must be a list'
    for point in mvp_points:
        assert isinstance(point, dict) and isinstance(point.get('timestamp'), (int, float)), 'MVP point needs its actual millisecond timestamp'
        assert not isinstance(point['timestamp'], bool) and 946684800000 <= point['timestamp'] <= 4102444800000, 'MVP timestamp must be Unix milliseconds'
        for side in ('yes', 'no'):
            assert point.get(side) is None or (isinstance(point[side], (int, float)) and not isinstance(point[side], bool)), 'MVP display prices must be normalized numbers or null'
    mvp_response_sha256 = hashlib.sha256(mvp_market_file.read_bytes()).hexdigest()
mvp_capture_status = (
    'IMPLEMENTED; recorded checks in MVPValidation / Реализовано; зафиксированные проверки в MVPValidation'
    if mvp_validation is not None else
    'IMPLEMENTED; browser captures recorded, see Screenshots / Реализовано; снимки в Screenshots'
    if mvp_captures else
    'IMPLEMENTED; final browser captures pending / Реализовано; итоговые снимки ожидаются'
)
start = min(x['requested_at_utc'] for x in manifest)
end = max(x['received_at_utc'] for x in manifest)
base = 'https://docs.polymarket.us/'
source_rows = [
 ('S01','Public REST and authenticated API','Публичный и авторизованный API',base+'api-reference/introduction'),
 ('S02','Public rate limits','Лимиты публичного API',base+'api-reference/rate-limits'),
 ('S03','US app/API terms, §§5, 7 and 19','Условия US, §§5, 7 и 19','https://polymarket.us/tos'),
 ('S04','Institutional data onboarding','Подключение институциональных данных',base+'data-guide/onboarding'),
 ('S05','Market listing and side schema','Рынки и исходы',base+'api-reference/markets/get-markets'),
 ('S06','Event schema','События',base+'api-reference/events/get-events'),
 ('S07','BBO / quote schema','Лучшие котировки',base+'api-reference/markets/get-market-bbo'),
 ('S08','Order book and statistics','Стакан и статистика',base+'api-reference/markets/get-market-book'),
 ('S09','Quote history','История котировок',base+'api-reference/price-history/get-price-history'),
 ('S10','Final settlement','Окончательный расчёт',base+'api-reference/markets/get-market-settlement'),
 ('S11','Search','Поиск',base+'api-reference/search/search'),
 ('S12','Series','Серии',base+'api-reference/series/get-series'),
 ('S13','Leagues','Лиги',base+'api-reference/sports/get-all-leagues'),
 ('S14','Tags','Теги',base+'api-reference/tags/get-tags'),
 ('S15','Market WebSocket','Поток рыночных данных',base+'api-reference/websocket/markets'),
 ('S16','Retail authentication','Розничная авторизация',base+'api-reference/authentication'),
 ('S17','Institutional data guide','Институциональные данные',base+'data-guide/overview'),
 ('S18','Institutional streaming','Институциональный поток',base+'streaming-endpoints/market-data-stream'),
 ('S19','Institutional trade aggregates','Агрегаты сделок',base+'api-reference/report/get-trade-stats'),
 ('S20','Reference cache / local history','Кэш и локальная история',base+'data-guide/market-data'),
 ('S21','Private portfolio','Личный портфель',base+'api-reference/portfolio/get-user-positions'),
 ('S22','International licensing','Международное лицензирование','https://institutional.polymarket.com/'),
 ('S23','International terms','Международные условия','https://docs.google.com/document/d/1N4aYlRcqaWCeKMID7vUSWJ1UPMvw_v6SP4cOFN8ZxR4/preview'),
 ('S24','Public event page captured','Снятая публичная страница события','https://polymarket.us/event/usfed-fomc-2026-09-16'),
 ('S25','Sports / fixtures','Спорт и расписание',base+'api-reference/sports/get-events-by-league-slug'),
 ('S26','The Oracle publication / About','Издание The Oracle / О нём','https://news.polymarket.com/about'),
 ('S27','Journalism Tools announcement','Анонс инструментов для журналистов','https://news.polymarket.com/p/new-polymarket-tools-for-journalists'),
 ('S28','Institutional Research and US/international data sales','Institutional Research и продажа данных US/международной биржи','https://news.polymarket.com/p/introducing-polymarket-institutional'),
 ('S29','Trading fees; not a data-licence quote','Торговые тарифы; не цена лицензии на данные',base+'fees'),
 ('S30','Current US documentation index; no article API found','Индекс US API; endpoint статей не найден',base+'llms.txt'),
]
sources = {row[0]:row[3] for row in source_rows}
# Inventory describes availability. A fetched response does not prove every optional field is populated.
inventory = [
 ('Search / Поиск','GET /v1/search','events[].title, slug, markets[]','Topic discovery / Поиск темы','FETCHED: 1 event / Получено: 1 событие','No key / Без ключа','Snapshot / По запросу','S11'),
 ('Events / События','GET /v1/events; /v1/events/slug/{slug}','event.id, title, category, startDate, endDate, markets[]','Event context and related contracts / Контекст и контракты','FETCHED: Fed event / Получено событие ФРС','No key / Без ключа','Snapshot / По запросу','S06'),
 ('Markets / Контракты','GET /v1/markets; /v1/market/slug/{slug}','market.id, slug, title, question, description, dates, status','Exact contract identity / Точная идентификация','FETCHED: 5 Fed contracts + 1 closed / 5 ФРС + 1 закрытый','No key / Без ключа','Snapshot / По запросу','S05'),
 ('Event images / Изображения событий','Nested event.image; market.image and subject/team graphics','Image URLs; optional at individual-contract level / URL; поле контракта необязательно','Event artwork, not article bodies or an unrestricted image licence / Оформление события, не статьи и не безусловная лицензия','FETCHED: Fed-event portrait URL; individual market may omit image / URL портрета события ФРС','No key for metadata / Метаданные без ключа','Metadata snapshot / Снимок метаданных','S06'),
 ('Outcomes / Исходы','Nested marketSides[] / Внутри рынка','id, long, description, quote.value, quote.currency, tradable','YES/NO mapping; legacy arrays deprecated / Сопоставление исходов','FETCHED: explicit Yes/No sides / Получены явные стороны','No key / Без ключа','Snapshot / По запросу','S05'),
 ('BBO / Лучшие цены','GET /v1/markets/{slug}/bbo','bestBid, bestAsk, longQuote, shortQuote, lastTradePx','Quote spread, distinct price bases / Спред и разные виды цен','FETCHED: bid 0.4700, ask 0.4800','No key / Без ключа','Snapshot / По запросу','S07'),
 ('Book / Стакан','GET /v1/markets/{slug}/book','bids[].px.value, qty; offers[].px.value, qty','Visible liquidity by level / Видимая ликвидность','FETCHED: 13 bid + 6 offer levels / уровней','No key / Без ключа','Snapshot / По запросу','S08'),
 ('Statistics / Статистика','BBO and book stats / BBO и stats стакана','sharesTraded, openInterest, lastTradeQty, timestamps, notionalTraded','Trade age, activity; units need validation / Давность, активность','FETCHED; statistic window/units not fully established','No key / Без ключа','Snapshot / По запросу','S08'),
 ('Display-price history / История цен','GET /v1/price-history','history[].timestamp, longPrice, shortPrice','Book-derived YES/NO; not trade tape / Из стакана, не лента сделок','FETCHED: 249 daily-profile + 57 weekly-profile samples','No key / Без ключа','Requested 5 min / 3 h; gaps observed','S09'),
 ('Settlement / Расчёт','GET /v1/markets/{slug}/settlement','slug, settlement','Final contract settlement / Окончательный расчёт','FETCHED: open 404; closed 200 with settlement=1','No key / Без ключа','When available / Когда доступен','S10'),
 ('Series / Серии','GET /v1/series','series[].id, slug, title, recurrence, active','Group events / Группировка событий','FETCHED: 2 rows / 2 записи','No key / Без ключа','Reference / Справочник','S12'),
 ('Leagues / Лиги','GET /v2/leagues','leagues[].id, name, slug, sportId, tagId','Sports taxonomy / Спортивная классификация','FETCHED: UEFA, MLB','No key / Без ключа','Reference / Справочник','S13'),
 ('Tags / Теги','GET /v2/tags','tags[].id, label, slug, parentId','Topic filters / Тематические фильтры','FETCHED: 5 rows including Supreme Court','No key / Без ключа','Reference / Справочник','S14'),
 ('Fixtures / Матчи','GET /v2/leagues/{slug}/events','events[].teams, score, live, ended, period','Fixture context; optional fields / Контекст матчей','DOCUMENTED ONLY / Только документация','Documented public / Публичный по документации','No cadence guarantee found / Без гарантии','S25'),
 ('Market stream / Рыночный поток','wss://api.polymarket.us/v1/ws/markets','marketData, marketDataLite, trade','Continuous books/quotes/trades / Поток стаканов, котировок, сделок','OPTIONAL MVP CONNECTION IMPLEMENTED; no local keys or upstream stream test / Реализовано; без ключей и проверки потока','Signed API key / Подписанный API-ключ','Real-time; no measured SLA / Без измеренного SLA','S15'),
 ('Institutional feed / Данные биржи','REST refdata + gRPC','instruments, symbols, price scale, depth, stats','Direct company data route / Прямой канал для компании','DOCUMENTED ONLY / Только документация','Agreement + issued scopes / Договор и доступ','REST / streaming','S17'),
 ('Trade aggregates / Агрегаты сделок','POST /v1/report/trades/stats','stats, bars, barStartTime, barEndTime','Trade-based aggregates, distinct from public history','DOCUMENTED ONLY / Только документация','Institutional JWT / Институциональный JWT','Requested interval / Заданный интервал','S19'),
 ('Private account / Личный аккаунт','Authenticated portfolio/orders/balances','Own positions, orders, activities, balances','Account-specific; not other traders / Только свой аккаунт','NOT ACCESSED; outside scope / Не проверялось','API key / API-ключ','REST / private stream','S21'),
 ('Related provider news / Новости провайдеров','Local GET /api/polymarket/news; not a Polymarket article endpoint','Publisher, headline, date, link, optional provider image / Издатель, заголовок, дата, ссылка, изображение','Separate news context; topic match does not prove price causation / Отдельный контекст, не доказательство причины цены','MVP IMPLEMENTED; not part of the 13 static API captures / Реализовано отдельно от 13 запросов','Existing provider paths; their terms apply / Каналы и условия провайдеров','Preview refresh 5 min / Обновление раз в 5 минут','S30'),
 ('The Oracle / Издание The Oracle','news.polymarket.com; separate publication, not US market API','Published articles, interviews and analysis / Статьи, интервью и аналитика','External reading link; no republication entitlement established / Внешняя ссылка; права копирования не установлены','OFFICIAL PUBLICATION VERIFIED; not ingested into MVP / Издание проверено; не загружается в MVP','Public publication; content rights separate / Публичное издание, отдельные права','Editorial schedule, not a market stream / Редакционная публикация','S26'),
 ('Journalism Tools / Инструменты журналистов','journalism.thespread.news; official announcement link','Market timeline with news, draft analyzer, liquidity tools / Новости на графике, поиск и ликвидность','Website capabilities; no supported news-ingestion API found / Функции сайта; API загрузки новостей не найден','ANNOUNCEMENT REVIEWED; not integrated / Анонс изучен; не интегрировано','Separate site/content scope / Отдельный сайт и контент','No API cadence established / Частота API не установлена','S27'),
 ('Institutional Research / Исследования','Separate publication announced July 2026 / Отдельное издание','Financial research and commercial-data contact / Исследования и контакт продажи данных','Not a news endpoint or published project data price / Не news endpoint и не тариф нашего проекта','OFFICIAL ANNOUNCEMENT REVIEWED / Официальный анонс изучен','Contact route; licence and cost unresolved / Права и цена не согласованы','Publication; no API SLA / Издание без установленного API SLA','S28'),
 ('International .com / Международный','Gamma / CLOB / WebSocket','Separate catalogue and data products / Другой каталог','Do not mix US and international / Не смешивать продукты','NOT SAMPLED in this workbook / Здесь без выборки','Separate terms/route / Другие условия','Separate assessment / Отдельная оценка','S22'),
]
permissions = [
 ('Connect public REST','Works without contacting them, login or key. The 13 saved capture requests used none; the local preview now polls public REST while visible and unpaused.','Работает без обращения, входа и ключа. 13 сохранённых запросов сделаны без них; локальная версия теперь опрашивает REST при открытой вкладке без паузы.','Technical access confirmed; not a blanket data licence','S01'),
 ('Standard data licence','US app terms include APIs; §5 is personal, noncommercial use connected with trading. §7 allows authorized API automation.','Условия US охватывают API; §5 — личное некоммерческое использование для торговли, §7 допускает автоматизацию через разрешённые API.','Corporate scope not clearly granted / Объём прав компании не подтверждён','S03'),
 ('Must we pay?','No applicable published commercial-data price found. Neither mandatory payment nor free company use is established.','Применимая публичная цена не найдена. Не установлена ни обязательная оплата, ни бесплатная лицензия компании.','UNKNOWN / НЕИЗВЕСТНО','S04'),
 ('Must we obtain permission?','Before recurring production company analytics, obtain written confirmation covering the public gateway or an applicable agreement. A local interactive preview is not itself an exemption.','До регулярной рабочей аналитики компании получить подтверждение для gateway либо договор. Локальная интерактивная версия сама по себе не создаёт исключения.','Production rights unresolved / Права рабочего использования не согласованы','S03'),
 ('Institutional route','Market Data Agreement via data@polymarket.us, review and issued credentials. Not proven mandatory for every public read.','Market Data Agreement через data@polymarket.us, рассмотрение и выдача доступа. Не доказана обязательность для любого публичного чтения.','Documented contract route; actual agreement not reviewed','S04'),
 ('History / cache / derived metrics','Data guides support local history/cache; our retention, derived-data and combined-source rights must be specified.','Руководства предусматривают историю и кэш; наши сроки, производные показатели и объединение источников нужно согласовать.','Capability supported; contract scope unresolved','S20'),
 ('Images / article content','Image URLs in market responses and public Oracle articles are available content, not an unrestricted reuse licence. Confirm image display, copying and any article reuse separately.','URL изображений и публичные статьи Oracle доступны технически, но не дают безусловной лицензии. Показ/копирование изображений и использование статей уточнить отдельно.','Content scope unresolved / Права на контент не согласованы','S03'),
 ('Employee display / AI / exports','Employee display, external model processing and public exports are different scopes; none follows automatically from no-key access.','Внутренний показ, внешняя AI-обработка и публичные выгрузки — разные сценарии; доступ без ключа их автоматически не разрешает.','Ask specifically / Уточнить отдельно','S03'),
 ('Retail streaming','The optional server WebSocket-to-SSE implementation requires a key. No local key or authenticated upstream stream test; a key would not itself resolve company rights.','Необязательный серверный мост WebSocket→SSE требует ключа. Локальных ключей и проверки реального потока нет; ключ сам по себе не подтверждает права компании.','Implemented; upstream not verified / Реализовано; поток не проверен','S16'),
 ('Commercial data sales / fees','July 2026 announcement offers data sales for US and international exchanges without publishing our price. Trading fees and feeCoefficient are not read-only data-licence prices.','Июльский анонс предлагает продажу данных US и международной биржи без цены для нас. Торговые тарифы и feeCoefficient не определяют цену лицензии на чтение.','Cost unresolved; payment not proven mandatory for every public read / Цена не согласована','S28'),
 ('ICE / international','International .com licensing must be assessed separately. No basis found to mandate ICE for this US API.','Условия международного .com оцениваются отдельно. Оснований считать ICE обязательным для US не найдено.','Separate products / Разные продукты','S22'),
 ('Static evidence / local preview','The saved 8 September capture used bounded requests with no continuing collector. The later local preview polls while visible/unpaused. Neither label creates a research or commercial-use exemption.','Сохранённая проверка 8 сентября ограничена запросами без постоянного сборщика. Поздняя локальная версия опрашивает API при открытой вкладке без паузы. Это не создаёт исследовательского или коммерческого исключения.','Workbook is static; local preview is interactive; rights unresolved / Книга статична; MVP интерактивен','S03'),
]

# Implementation inventory is separate from immutable 8 September observations.
mvp_integration = [
 ('Discovery / Поиск и темы','/polymarket → GET /api/polymarket/events?q=…','Public GET /v1/search or /v1/events','Polymarket US metadata / Метаданные US','REST; page refresh 60 s / Страница раз в 60 с',mvp_capture_status,'Company display scope unresolved / Права компании не согласованы','S01'),
 ('Event artwork / Изображения','Event and market cards / Карточки событий и рынков','event.image; subject/team assets where present','Polymarket response URLs / URL из ответа Polymarket','Images with metadata; missing-image fallback / Изображения с метаданными','IMPLEMENTED; use actual API artwork / Реализовано; оформление из API','Image/content rights separate from technical access / Права на изображения отдельно','S06'),
 ('YES/NO prices / Цены YES/NO','GET /api/polymarket/market?slug=…&interval=1d','GET /v1/markets/{slug}/bbo + /v1/market/slug/{slug}','Polymarket US; explicit marketSides / Явные стороны рынка','REST every 10 s; pause and hidden-tab pause / Каждые 10 с с паузой',mvp_capture_status,'Corporate usage scope unresolved / Корпоративные права не согласованы','S07'),
 ('Time-based chart / График по времени','Market detail; 1 day / 1 week tabs','GET /v1/price-history?symbol=…','Book-derived YES/NO display prices; NOT trade tape / Цены из стакана, не сделки','History cache 30 s; actual timestamps and shaded gaps / Кэш 30 с, время и пропуски',mvp_capture_status,'Confirm historical storage and derived display / Подтвердить историю и производный показ','S09'),
 ('Book and statistics / Стакан и статистика','GET /api/polymarket/market?slug=…','GET /v1/markets/{slug}/book and /bbo','Polymarket US quote levels and reported stats / Уровни и статистика US','REST refresh 10 s; units and timestamps remain distinct / Раз в 10 с',mvp_capture_status,'Confirm company use; no guarantee of fills/liquidity / Подтвердить права; без гарантии исполнения','S08'),
 ('Rules / Правила','Market detail / Карточка контракта','GET /v1/market/slug/{slug}','Contract description and dates; NOT journalism / Правила и даты, не журналистика','Metadata cache 60 s / Кэш метаданных 60 с','IMPLEMENTED; retain exact contract context / Реализовано','Content scope and attribution / Права и атрибуция','S05'),
 ('Related articles / Связанные статьи','GET /api/polymarket/news?topic=…','Existing news-service/provider paths; no US article API','Separate publishers/providers; NOT Polymarket news feed / Отдельные издатели, не лента Polymarket','Page refresh 5 min / Раз в 5 минут',mvp_capture_status,'Existing source terms; topic match does not prove price causation / Условия источников; не доказательство причины','S30'),
 ('Optional live stream / Необязательный поток','GET /api/polymarket/stream?slug=…','wss://api.polymarket.us/v1/ws/markets → server → SSE','Polymarket US status, quotes and book / Статус, цены и стакан','Signed upstream WebSocket; browser SSE / Подписанный WebSocket, затем SSE','IMPLEMENTED; no local keys; upstream NOT TESTED / Реализовано; ключей и проверки потока нет','Credentials and company rights both needed / Ключи и права — отдельные условия','S15'),
 ('AI boundary / Граница AI','Product AI panel hidden on /polymarket','No Polymarket prices sent to the product AI pipeline','Market data separate from existing article sources / Рыночные данные отдельно от статей','No model calls for these prices / Без запросов модели с ценами','IMPLEMENTED / Реализовано','External processing/training remains a separate unresolved scope / Внешняя обработка и обучение отдельно','S03'),
 ('Preview vs production / MVP и рабочий сервис','Local /polymarket preview','Server memory/cache; future Postgres collector separate','Live public responses plus static evidence in this workbook','Interactive while visible/unpaused; not an unattended production collector','LOCAL IMPLEMENTATION; production not deployed / Локально; рабочего развёртывания нет','No local/pilot exemption claimed; company rights unresolved / Без заявления об исключении','S04'),
]

def flatten(value, prefix=''):
    if isinstance(value, dict):
        for k,v in value.items():
            yield from flatten(v, prefix+'.'+k if prefix else k)
    elif isinstance(value, list):
        for i,v in enumerate(value): yield from flatten(v, f'{prefix}[{i}]')
    else: yield prefix,value

def as_text(value):
    if value is None:return 'null'
    if isinstance(value,bool):return 'true' if value else 'false'
    return str(value)

# Catalogue every observed terminal path, including empty containers. Array
# positions are normalized so one path describes repeated records without
# reproducing the entire historical time series in this catalogue.
def observed_leaves(value, prefix=''):
    if isinstance(value, dict) and value:
        for key, child in value.items():
            yield from observed_leaves(child, prefix + '.' + key if prefix else key)
    elif isinstance(value, list) and value:
        for index, child in enumerate(value):
            yield from observed_leaves(child, f'{prefix}[{index}]')
    else:
        yield prefix or '$', value

observed_field_rows = []
observed_leaf_count = 0
for req in manifest:
    catalogue = {}
    for path, value in observed_leaves(json.loads((EVIDENCE / req['file']).read_text())):
        normalized_path = re.sub(r'\[\d+\]', '[]', path)
        entry = catalogue.setdefault(normalized_path, {'types': set(), 'count': 0, 'samples': []})
        value_type = ('null' if value is None else 'boolean' if isinstance(value, bool)
                      else 'number' if isinstance(value, (int, float)) else 'string' if isinstance(value, str)
                      else 'array (empty)' if isinstance(value, list) else 'object (empty)')
        sample = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        entry['types'].add(value_type)
        entry['count'] += 1
        observed_leaf_count += 1
        if sample not in entry['samples'] and len(entry['samples']) < 3:
            entry['samples'].append(sample)
    for path, entry in sorted(catalogue.items()):
        observed_field_rows.append([req['id'], path, ', '.join(sorted(entry['types'])), entry['count'], '\n'.join(entry['samples']), req['received_at_utc'], req['url'], req['file'], req['sha256']])

field_rows=[]
for reqid, doc, paths in [
 ('event-fed','S06',['event.id','event.slug','event.title','event.image','event.category','event.startDate','event.endDate','event.active','event.closed']),
 ('market-fed','S05',['market.id','market.slug','market.question','market.title','market.category','market.startDate','market.endDate','market.status','market.closed','market.active','market.orderPriceMinTickSize','market.minimumTradeQty','market.marketSides']),
 ('bbo-fed','S07',['marketData.marketSlug','marketData.currentPx','marketData.lastTradePx','marketData.settlementPx','marketData.sharesTraded','marketData.openInterest','marketData.bestAsk','marketData.bestBid','marketData.askDepth','marketData.bidDepth','marketData.longQuote','marketData.shortQuote','marketData.state']),
 ('book-fed','S08',['marketData.transactTime','marketData.stats'])]:
    data=load(reqid)
    for path,value in flatten(data):
        if any(path==p or path.startswith(p+'.') or path.startswith(p+'[') for p in paths):
            if 'lastPriceSample' in path:continue
            note='Exact response value / Точное значение ответа'
            if 'settlementPx' in path:note='Reference/session value, NOT final outcome; final endpoint returned 404 / Не окончательный исход'
            if 'notionalTraded' in path:note='Raw amount; unit scaling unresolved, do not treat as verified USD turnover / Масштаб не подтверждён'
            if path.endswith('endDate'):note='Contract/event timestamps differ; preserve field meaning / Даты события и контракта различаются'
            if 'sharesTraded' in path:note='Source statistic; do not label 24h volume without verifying window / Период не подтверждён'
            if path.endswith('long'):note='Side identity; do not zip deprecated outcome arrays / Признак стороны'
            json_type = 'null' if value is None else 'boolean' if isinstance(value,bool) else 'number' if isinstance(value,(int,float)) else 'string'
            field_rows.append([reqid,path,json_type,as_text(value),'OBSERVED / ПОЛУЧЕНО',note,requests[reqid]['received_at_utc'],requests[reqid]['url'],sources[doc]])
for path in ['event.resolutionSource','event.seriesSlug']:
    field_rows.append(['event-fed',path,'optional','(absent in captured response)','NOT PRESENT / ОТСУТСТВУЕТ','Schema field is not guaranteed populated / Поле схемы не гарантирует значение',requests['event-fed']['received_at_utc'],requests['event-fed']['url'],sources['S06']])

# Static chart: break the line wherever requested five-minute observations are missing.
xs,ys,ns=[],[],[]
for i,h in enumerate(history):
    if i and h['timestamp']-history[i-1]['timestamp']>300:
        xs.append(datetime.fromtimestamp(history[i-1]['timestamp']+1,timezone.utc));ys.append(float('nan'));ns.append(float('nan'))
    xs.append(datetime.fromtimestamp(h['timestamp'],timezone.utc));ys.append(h['longPrice']);ns.append(h['shortPrice'])
fig,ax=plt.subplots(figsize=(11.5,4.6),dpi=170)
fig.patch.set_facecolor('#ffffff');ax.set_facecolor('#f8fafc')
ax.plot(xs,ys,color='#2563eb',linewidth=1.6,marker='o',markersize=2,label='YES display quote / YES из стакана')
ax.plot(xs,ns,color='#0f766e',linewidth=1.6,marker='o',markersize=2,label='NO display quote / NO из стакана')
ax.set_title('Fed decision, September 2026 — No Change contract',loc='left',fontweight='bold',fontsize=13)
ax.set_ylabel('Contract price (USD)');ax.set_xlabel('Observation time, UTC • 7–8 September 2026')
ax.xaxis.set_major_formatter(mdates.DateFormatter('%d Sep\n%H:%M',tz=timezone.utc))
ax.grid(axis='y',alpha=.2);ax.legend(loc='upper left',frameon=False,fontsize=9)
for spine in ['top','right']:ax.spines[spine].set_visible(False)
fig.text(.07,.015,'Generated from 249 actual public API samples. Missing intervals are gaps; no values filled. Not a Polymarket website screenshot.',fontsize=8,color='#475569')
fig.tight_layout(rect=(0,.055,1,1));fig.savefig(SCREENSHOTS/'polymarket-us-fed-history.png');plt.close(fig)

workbook=xlsxwriter.Workbook(DOCS/'reports/Polymarket-Data-Inventory.xlsx',{'strings_to_formulas':False,'strings_to_urls':False})
workbook.set_properties({'title':'Polymarket US — data inventory and local MVP','subject':'Dated public API evidence, implementation mapping and access rights','author':'Research team','comments':'Workbook is static: no refresh connections, macros or trading actions. Local MVP polling is documented separately.'})
navy='#13263D';teal='#0F766E'
titlefmt=workbook.add_format({'bold':True,'font_size':18,'font_color':navy})
subfmt=workbook.add_format({'font_size':10,'font_color':'#475569','text_wrap':True,'valign':'top'})
textfmt=workbook.add_format({'text_wrap':True,'valign':'top','font_size':10})
linkfmt=workbook.add_format({'font_color':'#1D4ED8','underline':1,'text_wrap':True,'valign':'top'})
datefmt=workbook.add_format({'num_format':'yyyy-mm-dd hh:mm','valign':'top'})
pricefmt=workbook.add_format({'num_format':'0.0000','valign':'top'})
headerfmt=workbook.add_format({'bold':True,'bg_color':navy,'font_color':'#FFFFFF','text_wrap':True,'valign':'top'})


def table_sheet(name,title,headers,rows,widths,subtitle='',urls=(),rowheight=42):
    sheet=workbook.add_worksheet(name);sheet.hide_gridlines(2);sheet.set_tab_color(teal)
    sheet.merge_range(0,0,0,len(headers)-1,title,titlefmt);sheet.set_row(0,28)
    sheet.merge_range(1,0,2,len(headers)-1,subtitle or ('Captured '+start+' to '+end+' | UTC; static evidence'),subfmt)
    for i,w in enumerate(widths):sheet.set_column(i,i,w,textfmt)
    if rows:
        sheet.add_table(4,0,4+len(rows),len(headers)-1,{'name':'T_'+name.replace(' ','_'),'style':'Table Style Medium 2','columns':[{'header':h} for h in headers],'data':rows})
    else:
        sheet.write_row(4,0,headers,headerfmt)
    sheet.set_row(4,32,headerfmt)
    for r,row in enumerate(rows,5):
        sheet.set_row(r,rowheight)
        for c in urls:
            if row[c] and str(row[c]).startswith('https://'):sheet.write_url(r,c,row[c],linkfmt)
    sheet.freeze_panes(5,2 if name in ('FieldExamples','DataInventory','Requests') else 0)
    sheet.set_landscape();sheet.set_paper(9);sheet.fit_to_pages(1,0);sheet.repeat_rows(4);sheet.set_margins(.3,.3,.4,.4)
    sheet.set_header('&LPolymarket US — inventory and local MVP&RAPI samples: 8 September 2026')
    sheet.set_footer('&LStatic observations; usage rights unresolved&RPage &P of &N')
    return sheet

summary=[
 ('Purpose / Назначение','Data inventory, fixed API examples, local MVP implementation and rights status. Updated 9 September 2026.','Перечень данных, фиксированные примеры API, локальный MVP и права. Обновлено 9 сентября 2026 года.'),
 ('Scope / Объём','Polymarket US. International .com is a separate product.','Polymarket US. Международный .com — отдельный продукт.'),
 ('Observed / Получено',f'{len(manifest)} bounded GET requests; 12 HTTP 200 and 1 HTTP 404. No key, cookies or login supplied.','13 ограниченных GET-запросов: 12 HTTP 200 и 1 HTTP 404. Без ключей, cookies и входа.'),
 ('Example / Пример','Fed Decision in September; 5 contracts. Main example: No Change.','Решение ФРС в сентябре; 5 контрактов. Основной пример: без изменения ставки.'),
 ('Price / Цена','Bid 0.4700; ask 0.4800; YES 0.4800; NO 0.53. Price bases differ.','Покупка 0,4700; продажа 0,4800; YES 0,4800; NO 0,53. Это разные виды цен.'),
 ('History / История','249 daily-profile and 57 weekly-profile quotes. Daily series contains gaps. Not an executed-trade tape.','249 точек суточного и 57 недельного окна. В суточном ряду есть пропуски. Это не лента сделок.'),
 ('Images / Изображения','Saved Fed event includes an image URL. Market graphics and contract descriptions are separate from journalism and image-reuse rights.','Событие ФРС содержит URL изображения. Оформление и правила контракта — не журналистика и не лицензия на повторное использование.'),
 ('News / Новости','The Oracle is a real separate Polymarket publication. No documented US article endpoint found; MVP related news uses existing providers with separate attribution.','The Oracle — отдельное издание Polymarket. Endpoint статей в US API не найден; новости MVP — из существующих источников с отдельной атрибуцией.'),
 ('Local MVP / Локальный MVP','/polymarket page and server adapter implemented. Selected REST data polls every 10 s while visible/unpaused; event refresh 60 s, news 5 min, history cache 30 s.','Страница /polymarket и серверный адаптер реализованы. REST раз в 10 с при видимой вкладке без паузы; события 60 с, новости 5 мин, кэш истории 30 с.'),
 ('MVP verification / Проверка MVP',mvp_capture_status,'Зафиксированные проверки приводятся на MVPValidation, если файл существует; снимки — на Screenshots. Проверка реального WebSocket не выполнена.'),
 ('MVP chart evidence / Данные графика MVP',f'{len(mvp_points)} actual normalized history points in MVPHistory; see its response receipt time and file hash.' if mvp_response is not None else 'New MVP market response not recorded yet; no new chart values invented or copied from old capture.',f'{len(mvp_points)} реальных нормализованных точек на MVPHistory; время получения и хеш файла указаны отдельно.' if mvp_response is not None else 'Новый ответ MVP ещё не записан; данные графика не придуманы и не скопированы из старой выборки.'),
 ('Payment / Оплата','No required commercial price established. Do not interpret no-key access as a free business licence.','Обязательная цена не установлена. Доступ без ключа не означает бесплатную лицензию для компании.'),
 ('Permission / Разрешение','Public REST is technically open. Recurring production company analytics needs written scope confirmation or an applicable agreement; local preview is not a licensing exemption.','Публичный REST технически открыт. Для регулярной рабочей аналитики нужны подтверждение прав или договор; локальная версия не создаёт исключения.'),
 ('Not tested / Не проверено','Authenticated upstream WebSocket, institutional feeds and private data. Optional WS-to-SSE code is implemented; no local keys. No trades or agreement acceptance.','Авторизованный поток поставщика, институциональные и закрытые данные. Код WS→SSE реализован; локальных ключей нет. Без сделок и принятия договора.'),
 ('Read / Как читать','DataInventory = categories; MVPIntegration = local implementation; AllObservedFields = every terminal path in all 13 saved responses; FieldExamples = selected annotated fields; Requests = traceability.','DataInventory — категории; MVPIntegration — реализация; AllObservedFields — все конечные пути в 13 ответах; FieldExamples — выбранные поля с пояснениями; Requests — происхождение.'),
 ('Preview bounds / Границы MVP','Up to 8 search events and 40 contracts per event; top 5 bid/ask levels displayed (adapter maximum 50 per side); 6 news cards from up to 12 results; day/week history. Not an exhaustive exchange archive.','До 8 событий поиска и 40 контрактов на событие; показ 5 уровней каждой стороны стакана (адаптер до 50); 6 новостей из максимум 12; день/неделя. Это не полный архив биржи.'),
 ('Evidence / Доказательства','Actual public-page and any recorded local-preview screenshots, plus a separate generated chart. Screenshot observations and saved API times differ.','Реальные снимки публичных страниц и записанные снимки локальной версии, плюс отдельный график. Время скриншотов и сохранённых API различается.'),
 ('Distribution / Распространение','Local internal review artifact. Public redistribution rights are not established; repository is public.','Локальный материал внутренней проверки. Права на публичное распространение не установлены; репозиторий публичный.'),
]
table_sheet('Readme','Polymarket US | Data inventory / Данные', ['Topic / Тема','English','Русский'],summary,[24,76,76],rowheight=55)
table_sheet('DataInventory','What data exists / Какие данные доступны',['Data / Данные','Endpoint','Useful fields / Поля','Use / Применение','Evidence / Проверка','Technical access / Доступ','Freshness / Частота','Source'],[list(r[:-1])+[sources[r[-1]]] for r in inventory],[31,49,61,61,58,33,45,45],urls=(7,),rowheight=64)
table_sheet('MVPIntegration','Local MVP implementation / Реализация локального MVP',['Feature / Функция','Local route / Локальный адрес','Upstream endpoint / Источник','Data source / Происхождение','Transport / Refresh','Implementation / Verification','Rights / Права','Reference URL'],[list(r[:-1])+[sources[r[-1]]] for r in mvp_integration],[35,62,68,70,70,78,76,55],subtitle='Implementation updated 9 September 2026. Fixed 8 September captures are separate. Any recorded checks are in MVPValidation; new chart values are in MVPHistory; screenshot times are in Screenshots. Upstream WebSocket unverified.',urls=(7,),rowheight=90)
if mvp_validation is not None:
    validation_sha256 = hashlib.sha256(mvp_validation_file.read_bytes()).hexdigest()
    validation_rows = [[path, as_text(value), str(mvp_validation_file.relative_to(DOCS)), validation_sha256] for path, value in flatten(mvp_validation)]
    table_sheet('MVPValidation','Recorded local MVP checks / Зафиксированные проверки MVP',['Recorded field / Поле','Actual recorded value / Значение','Record file / Файл','SHA-256'],validation_rows,[58,100,64,69],subtitle='Exact recorded validation fields, including test results and any captured-history count. A record or screenshot does not imply that unrecorded checks passed; upstream authenticated WebSocket remains unverified.',rowheight=48)
if mvp_response is not None:
    mvp_market = mvp_response.get('market') or {}
    mvp_meta = mvp_response.get('meta') or {}
    mvp_history_url = next((url for url in mvp_meta.get('upstreamUrls', []) if '/price-history' in url), '')
    mvp_history_receipt = mvp_history.get('fetchedAt', '') if mvp_history else ''
    mvp_interval = mvp_history.get('interval', '') if mvp_history else ''
    mvp_history_rows = [[point['timestamp'], datetime.fromtimestamp(point['timestamp'] / 1000, timezone.utc).replace(tzinfo=None), point.get('yes'), point.get('no'), mvp_market.get('slug', ''), mvp_interval, mvp_history_receipt, mvp_meta.get('fetchedAt', ''), mvp_history_url, str(mvp_market_file.relative_to(DOCS)), mvp_response_sha256, 'See Screenshots; separate observation / Отдельное наблюдение' if mvp_captures else 'No local MVP screenshot recorded / Снимок MVP не записан'] for point in mvp_points]
    mh = table_sheet('MVPHistory','Actual local MVP chart data / Реальные данные графика MVP',['Unix milliseconds','Observation UTC','YES display price','NO display price','Market slug','Interval','History received UTC','Response meta UTC','History upstream URL','Normalized response file','SHA-256 response','Related MVP screenshots'],mvp_history_rows,[23,25,20,20,56,13,34,34,94,66,69,65],subtitle=f'{len(mvp_points)} points from the separately saved normalized local response, not the old 8 September History sheet. Missing prices remain blank; screenshots are related separate observations, with their own capture times.',urls=(8,),rowheight=35)
    for row, values in enumerate(mvp_history_rows, 5):
        mh.write_datetime(row, 1, values[1], datefmt)
        for column in (2, 3):
            if values[column] is not None:
                mh.write_number(row, column, values[column], pricefmt)
        if mvp_captures:
            mh.write_url(row, 11, 'internal:Screenshots!A1', linkfmt, values[11])
    if not mvp_points:
        mh.merge_range(5, 0, 6, 11, 'The actual local response contains no normalized history points. No chart values have been invented. / В реальном ответе нет исторических точек; значения не придуманы.', subfmt)
table_sheet('FieldExamples','Exact response fields / Точные поля ответа',['Capture ID','JSON path','JSON type','Raw value / Значение','Observed? / Получено?','Meaning / Примечание','Received UTC','Request URL','Schema URL'],field_rows,[18,52,12,60,28,66,34,62,52],urls=(7,8),rowheight=45)
table_sheet('AllObservedFields','Every observed field / Все полученные поля',['Capture ID','Normalized JSON path','Observed JSON types','Occurrence count','First up to 3 distinct values (JSON)','Received UTC','Request URL','Evidence file','SHA-256 response'],observed_field_rows,[23,65,25,19,98,35,85,32,69],subtitle=f'{len(observed_field_rows)} request/path rows across all 13 saved responses; {observed_leaf_count} terminal observations. Array indices normalize to []; empty containers are recorded. Samples retain JSON types. This is the complete observed field catalogue, not a claim that every optional documented field or exchange market was fetched.',urls=(6,),rowheight=72)
market_rows=[]
for m in event['markets']:
    sides=m.get('marketSides',[])
    yes=next((s for s in sides if s.get('long') is True),{});no=next((s for s in sides if s.get('long') is False),{})
    amount=lambda obj: obj.get('value') if isinstance(obj,dict) else None
    market_rows.append([m['id'],m['slug'],m.get('title'),m.get('status'),amount(m.get('bestBidQuote')),amount(m.get('bestAskQuote')),amount(yes.get('quote')),amount(no.get('quote')),m.get('endDate'),event.get('endDate'),requests['event-fed']['received_at_utc']])
table_sheet('Markets','Five actual Fed contracts / Пять контрактов ФРС',['ID (text)','Market slug','Contract / Контракт','Status','Bid raw','Ask raw','YES raw','NO raw','Contract end UTC','Event end UTC','Received UTC'],market_rows,[16,54,24,30,15,15,15,15,26,26,34],subtitle='Exact strings from event response. Blank = absent, not zero. These offers are not a normalized probability distribution.',rowheight=44)
book_rows=[]
for side,key in [('BID / ПОКУПКА','bids'),('ASK / ПРОДАЖА','offers')]:
    for i,row in enumerate(book[key],1):book_rows.append([side,i,row['px']['value'],row['px'].get('currency'),row['qty'],book.get('transactTime'),requests['book-fed']['received_at_utc']])
table_sheet('Book','Actual order-book levels / Уровни стакана',['Side / Сторона','Level','Price raw','Currency','Quantity raw','Upstream time UTC','Received UTC'],book_rows,[24,10,18,12,20,43,35],subtitle='No Change contract. Raw strings preserved. Visible depth is one snapshot, not total tradable capacity.',rowheight=26)
history_rows=[]
for window,items,reqid in [('1D / 5-minute requested',history,'history-fed-1d'),('1W / 3-hour requested',weekly,'history-fed-1w')]:
    for h in items:history_rows.append([window,h['timestamp'],datetime.fromtimestamp(h['timestamp'],timezone.utc).replace(tzinfo=None),h['longPrice'],h['shortPrice'],reqid])
hs=table_sheet('History','Actual historical quote samples / История котировок',['Requested profile','Unix seconds','Observation UTC','YES quote','NO quote','Capture ID'],history_rows,[29,19,24,16,16,23],subtitle='Book-derived display quotes, not trades. Missing intervals are not filled. Chart shows actual points only.',rowheight=21)
for row,vals in enumerate(history_rows,5):
    hs.write_datetime(row,2,vals[2],datefmt);hs.write_number(row,3,vals[3],pricefmt);hs.write_number(row,4,vals[4],pricefmt)
chart=workbook.add_chart({'type':'scatter'})
for col,label,color in [(3,'YES display quote','#2563EB'),(4,'NO display quote','#0F766E')]:
    chart.add_series({'name':label,'categories':['History',5,2,4+len(history),2],'values':['History',5,col,4+len(history),col],'marker':{'type':'circle','size':3,'border':{'color':color},'fill':{'color':color}},'line':{'none':True}})
chart.set_title({'name':'Fed No Change — actual 1-day observations'})
chart.set_x_axis({'name':'UTC; actual points, no interpolation','num_format':'dd mmm hh:mm'})
chart.set_y_axis({'name':'Contract price (USD)'})
chart.set_legend({'position':'bottom'});chart.set_size({'width':850,'height':420});hs.insert_chart('H5',chart)
reference=[]
for reqid,key,fields in [('series','series',['id','slug','title','recurrence','active']),('leagues','leagues',['id','slug','name','sportId','tagId','activeSeriesId','isOperational']),('tags','tags',['id','slug','label','parentId'])]:
    for obj in load(reqid)[key]:
        for field in fields:reference.append([reqid,as_text(obj.get('id')),field,as_text(obj[field]) if field in obj else '(absent)','OBSERVED' if field in obj else 'NOT PRESENT',requests[reqid]['received_at_utc']])
table_sheet('Reference','Series, leagues and tags / Справочники',['Capture ID','Record ID','Field','Raw value','Status','Received UTC'],reference,[18,17,25,64,22,35],rowheight=25)
settlement=[]
for reqid in ['settlement-fed','settlement-closed']:
    obj=load(reqid);settlement.append([reqid,requests[reqid]['http_status'],obj.get('slug',market['slug']),obj.get('settlement'),obj.get('message','Final settlement returned / Получен окончательный расчёт'),requests[reqid]['received_at_utc'],requests[reqid]['url']])
table_sheet('Settlement','Final settlement is separate / Окончательный расчёт отдельно',['Capture ID','HTTP','Market slug','Settlement','Meaning / Response','Received UTC','Request URL'],settlement,[24,10,55,14,77,35,65],subtitle='Open Fed contract: endpoint 404 despite BBO settlementPx 0.5000. Closed sports example: endpoint 200 with settlement 1.',urls=(6,),rowheight=65)
table_sheet('Permissions','Access, permission and payment / Доступ, права и оплата',['Question','English','Русский','Conclusion / Вывод','Official source'],[list(r[:-1])+[sources[r[-1]]] for r in permissions],[29,90,90,65,50],urls=(4,),rowheight=85)
request_rows=[[m['id'],m['method'],m['http_status'],m['requested_at_utc'],m['received_at_utc'],m['url'],m['authentication'],m['bytes'],m['sha256'],m['file']] for m in manifest]
table_sheet('Requests','Capture log / Журнал получения',['Capture ID','Method','HTTP','Requested UTC','Received UTC','URL','Authentication','Bytes','SHA-256 response','Local evidence file'],request_rows,[24,10,10,35,35,85,49,12,69,29],urls=(5,),rowheight=55)
table_sheet('Sources','Primary sources / Официальные источники',['ID','English','Русский','URL'],source_rows,[10,54,54,95],urls=(3,),rowheight=42)
ss=workbook.add_worksheet('Screenshots');ss.hide_gridlines(2);ss.set_tab_color('#2563EB');ss.set_column('A:L',12)
ss.set_default_row(15)
ss.merge_range('A1:L1','Website and local preview captures / Сайт и локальная версия',titlefmt)
row=3
for cap in captures:
    image_path = DOCS / cap['file']
    image_header = image_path.read_bytes()[:24]
    assert image_header[:8] == b'\x89PNG\r\n\x1a\n', 'Screenshot layout expects PNG captures'
    pixel_width, pixel_height = struct.unpack('>II', image_header[16:24])
    scale = .65
    ss.merge_range(row,0,row+1,11,cap['kind']+' | '+cap['captured_at_utc'],subfmt)
    ss.write_url(row+2,0,cap['url'],linkfmt)
    ss.insert_image(row+4,0,str(image_path),{'x_scale':scale,'y_scale':scale,'object_position':1,'description':cap['kind']})
    # Default 15-point rows are 20 pixels. Reserve the full scaled image height,
    # caption rows and a gap so tall local-preview captures cannot overlap.
    row += 4 + math.ceil(pixel_height * scale / 20) + 3
ss.set_landscape();ss.set_paper(9);ss.fit_to_pages(1,0)
workbook.close()
summary_out={'captured_from_utc':start,'captured_to_utc':end,'request_count':len(manifest),'http_200':sum(m['http_status']==200 for m in manifest),'http_404':sum(m['http_status']==404 for m in manifest),'contracts':len(market_rows),'book_levels':len(book_rows),'daily_samples':len(history),'weekly_samples':len(weekly),'field_examples':len(field_rows),'all_observed_fields':len(observed_field_rows),'observed_terminal_values':observed_leaf_count,'inventory_categories':len(inventory),'reference_fields':len(reference),'mvp_features':len(mvp_integration),'mvp_browser_captures':len(mvp_captures),'mvp_history_samples':len(mvp_points) if mvp_response is not None else None,'mvp_response_sha256':mvp_response_sha256,'mvp_validation_recorded':mvp_validation is not None}
(EVIDENCE/'inventory-summary.json').write_text(json.dumps(summary_out,indent=2)+'\n')
print(json.dumps(summary_out,indent=2))
print('Built docs/polymarket/reports/Polymarket-Data-Inventory.xlsx and chart; no network requests.')

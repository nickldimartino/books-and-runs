// Russian (ru) dictionary. Uses informal "ты" address throughout.
// Russian has 4 CLDR plural categories (one/few/many/other), not 2 like
// English, so every English "<key>.one"/"<key>.other" pair here becomes
// four sibling keys: "<key>.one", "<key>.few", "<key>.many", "<key>.other".
const ru = {
  "common.back": "Назад",
  "common.backToHome": "На главную",
  "common.home": "Главная",
  "common.dismissTip": "Скрыть подсказку",
  "common.loading": "Загрузка…",
  "common.cancel": "Отмена",
  "common.confirm": "Подтвердить",
  "common.save": "Сохранить",
  "common.saving": "Сохранение…",
  "common.saved": "Сохранено.",
  "common.done": "Готово",
  "common.none": "Нет",
  "common.error": "Не удалось сохранить — проверь подключение.",
  "common.retry": "Повторить",

  "settings.language.title": "Язык",
  "settings.language.description":
    "Меняет язык сайта. Некоторые страницы пока не переведены и будут показываться на английском.",

  "settings.whatDoesThisDo": "Что это значит?",
  "settings.tapToChange": "Нажми, чтобы изменить",
  "settings.cardFace": "Лицевая сторона карт",
  "settings.ambientSong": "Фоновая мелодия",
  "settings.matchTableTheme": "Подстроить под тему стола",
  "settings.theme": "Тема",
  "settings.cardBack": "Рубашка карт",
  "settings.allSongs": "Все мелодии",
  "settingsPicker.currently": "Сейчас:",
  "settingsPicker.matchThemeHint": "Всегда следует за темой, выбранной выше.",
  "settingsPicker.tabClassic": "Классика",
  "settingsPicker.tabHoliday": "Праздничные",
  "settingsPicker.signature": "Фирменные",
  "settingsPicker.unlocksAtLevel": "Открывается на уровне {level}",
  "settingsPicker.boutiqueLocked": "Бутик — пока недоступно для покупки",
  "player.badge.free": "Бесплатно",
  "cosmeticReq.categoryMastered": "Освой все достижения категории «{category}»",
  "cosmeticReq.categoriesMasteredCount": "Освой {count} из {total} категорий достижений",
  "cosmeticReq.allCategoriesMastered": "Освой все категории достижений",
  "cosmeticReq.gamesPlayed": "Сыграй {count} игр в одиночку или в режиме «передай устройство»",
  "cosmeticReq.dailyDealStreak": "Достигни серии из {days} дн. в «Раскладе дня»",
  "cosmeticReq.weeklyChallengeStreak": "Достигни серии из {weeks} нед. в испытании недели",
  "cosmeticReq.complete": "Освой все категории, достигни 250-го уровня и серии из 30 дн. в «Раскладе дня»",
  "cosmeticReq.creatorOnly": "Только для создателя Books & Runs",
  "cosmeticReq.supporterOnly": "Открывается за чаевые — см. Настройки → Помощь → Поддержать разработчика",
  "cosmeticReq.worstScoreUnder": "Ни разу не заверши игру больше чем с {score} очками",
  "cosmeticReq.averageScoreUnder": "Средний счёт ниже {score} очков за {games}+ игр",
  "cosmeticReq.gamesTied.one": "Сыграй вничью {count} игру",
  "cosmeticReq.gamesTied.few": "Сыграй вничью {count} игры",
  "cosmeticReq.gamesTied.many": "Сыграй вничью {count} игр",
  "cosmeticReq.gamesTied.other": "Сыграй вничью {count} игры",
  "cosmeticReq.mpWinStreak": "Достигни серии из {streak} побед подряд в сетевой игре",
  "cosmeticReq.cat.accountStats": "Статистика аккаунта",
  "cosmeticReq.cat.aiRivals": "Соперники-ИИ",
  "cosmeticReq.cat.melding": "Выкладывание",
  "cosmeticReq.cat.layingOff": "Подкладывание",
  "cosmeticReq.cat.drawDiscard": "Добор и сброс",
  "cosmeticReq.cat.goingOut": "Выход из раунда",
  "cosmeticReq.cat.contracts": "Контракты",
  "cosmeticReq.cat.tableComposition": "Состав стола",
  "cosmeticReq.cat.multiplayer": "Сетевая игра",
  "cosmeticReq.cat.challenges": "Испытания",
  "settingsTheme.signInPrompt": "Войди, чтобы выбрать тему: без входа всегда используется стандартный стол, так что между устройствами ничего не потеряется.",
  "settingsCardBack.description": "Узор и цвет рубашки твоих карт — колоды для добора и руки другого игрока, пока она закрыта. Не зависит от темы, поэтому любой стол можно сочетать с любой рубашкой.",
  "settingsCardFace.description": "Как рисуются ранг и масть карты. Не зависит от темы и рубашки, поэтому любой стол можно сочетать с любой лицевой стороной.",
  "settingsAmbientSong.description": "Проигрывает все мелодии по порядку вперёд, затем назад, по 3 минуты каждая с плавным переходом — или закрепи одну.",
  "settingsAmbientSong.playAll": "Играть все мелодии",
  "settingsAmbientSong.listen": "Прослушать: {name}",
  "settingsAmbientSong.stopListening": "Остановить прослушивание: {name}",
  "settingsTheme.desc.midnight": "Оригинальный тёмный стол с сукном.",
  "settingsTheme.desc.daylight": "Чистый и светлый, легко читается в светлых комнатах.",
  "settingsTheme.desc.casino": "Глубокий красный и золото, эффектное сукно для хайроллеров.",
  "settingsTheme.desc.pastel": "Барвинок, коралл и мята — мягко и приятно для глаз.",
  "settingsTheme.desc.arcade": "Неоновый циан и розовый на фиолетовом столе в стиле синтвейв.",
  "settingsTheme.desc.sakura": "Розовый цвет сакуры и белый с глубоким малиновым акцентом.",
  "settingsTheme.desc.noir": "Строго чёрный, белый и серый — карточный стол из старого фильма.",
  "settingsTheme.desc.citrus": "Яркий красный апельсин и зелень цитрусовых листьев на солнце.",
  "settingsTheme.desc.ember": "Вулканический чёрный с раскалённым оранжево-красным свечением.",
  "settingsTheme.desc.frost": "Ледяной бледно-голубой с белым и чётким ледниково-синим акцентом.",
  "settingsTheme.desc.lagoon": "Глубокий тропический бирюзовый с ярким коралловым акцентом.",
  "settingsTheme.desc.meadow": "Шалфейно-зелёный и кремовый, согретые масляным золотым акцентом.",
  "settingsTheme.desc.sahara": "Тёплая пустынная терракота, остывающая до бирюзового вечернего неба.",
  "settingsTheme.desc.coralsand": "Выцветший на солнце пляжный песок с коралловым и океанским синим акцентом.",
  "settingsTheme.desc.aurora": "Полярное ночное небо, переливающееся зелёным, фиолетовым и ледяным цианом.",
  "settingsTheme.desc.lilac": "Мягкий серо-лавандовый туман с глубоким сливовым акцентом.",
  "settingsTheme.desc.jade": "Чёрный лак и нефритовый зелёный с императорской золотой отделкой.",
  "settingsTheme.desc.champagne": "Бледное золото и слоновая кость, элегантно и празднично.",
  "settingsTheme.desc.verdigris": "Патина выветренной меди, согретая блеском полированной меди.",
  "settingsTheme.desc.alabaster": "Строго камень и уголь — светлый близнец темы Film Noir.",
  "settingsTheme.desc.valentines": "Романтичный розово-красный и глубокий бордовый.",
  "settingsTheme.desc.sweetheart": "Нежно-розовый и белый, как валентинка.",
  "settingsTheme.desc.stpatricks": "Зелёный клевер и золото с намёком на ирландский оранжевый.",
  "settingsTheme.desc.cloverfield": "Бледная мята и крем с ярким клеверно-зелёным акцентом.",
  "settingsTheme.desc.springdusk": "Сумеречная слива, сквозь которую пробиваются пастельная мята и лаванда.",
  "settingsTheme.desc.easter": "Пастельная лаванда, весенняя мята и жёлтый мармелад.",
  "settingsTheme.desc.july4th": "Фейерверк в полуночно-синем небе, красный, белый и синий.",
  "settingsTheme.desc.starsandstripes": "Чёткие дневные красный, белый и синий — барбекю на заднем дворе.",
  "settingsTheme.desc.halloween": "Ведьмин фиолетовый и оранжевый тыквенного фонаря после наступления темноты.",
  "settingsTheme.desc.candycorn": "Крем и тыквенный оранжевый с игривым фиолетовым акцентом.",
  "settingsTheme.desc.thanksgiving": "Осенний коричневый и тыквенный оранжевый, тепло и уютно.",
  "settingsTheme.desc.pumpkinspice": "Тёплый кремовый и коричный коричневый с тыквенно-оранжевым акцентом.",
  "settingsTheme.desc.hanukkah": "Королевский синий и серебро, освещённые золотом меноры.",
  "settingsTheme.desc.festivaloflights": "Бледный ледяной голубой и белый, освещённые золотом меноры.",
  "settingsTheme.desc.christmas": "Сосново-зелёный и красный падуба с золотой отделкой.",
  "settingsTheme.desc.candycane": "Мятно-белый и красный с полосами цвета сосны.",
  "settingsTheme.desc.newyears": "Смокинговый чёрный и золото шампанского, готовые к полуночи.",
  "settingsTheme.desc.confetti": "Яркий белый с золотым и конфетти-розовым всплеском.",
  "settingsCardBack.desc.foilweave": "Тонкое диагональное металлическое плетение — сочетается с лицом Foil.",
  "settingsCardBack.desc.static": "Россыпь точек, как у старого телевизора между каналами.",
  "settingsCardBack.desc.houndstooth": "Классический твидовый узор из пересекающихся диагоналей.",
  "settingsCardBack.desc.marble": "Мягкая неровная фактура каменных прожилок.",
  "settingsCardBack.desc.tartan": "Клетчатый тартан с пересекающейся сеткой, как скатерть в старом карточном зале.",
  "settingsCardBack.desc.quilted": "Стёганый узор из пересекающихся ромбов.",
  "settingsCardBack.desc.starfield": "Рассыпанные точки света двух размеров на почти чёрном фоне.",
  "settingsCardBack.desc.brushed": "Тонкие параллельные линии, как шлифованный металл, ловящий свет.",
  "settingsCardBack.desc.chevron": "Чередующаяся диагональная шашка, как зигзагообразная ёлочка.",
  "settingsCardBack.desc.basketweave": "Толстые пересекающиеся полосы, как плетёная корзина.",
  "settingsCardFace.desc.classic": "Один крупный ранг и масть по центру — самый чёткий вариант с первого взгляда.",
  "settingsCardFace.desc.realistic": "Традиционная печатная карта: индексы в углах и полная раскладка мастей.",
  "settingsCardFace.desc.bold": "Самый крупный ранг среди всех стилей — максимальная читаемость.",
  "settingsCardFace.desc.minimal": "Спокойная сдержанная лицевая сторона с тонкой контурной мастью.",
  "settingsCardFace.desc.retro": "Винтажный вид карточного стола с рангом с засечками и рамкой.",
  "settingsCardFace.desc.pixel": "Массивная блочная лицевая сторона в стиле ретро-игры.",
  "settingsCardFace.desc.foil": "Классическая раскладка с мерцающим проблеском света, как голографическая коллекционная карта.",
  "settingsCardFace.desc.outline": "Классическая раскладка, нарисованная только чистой линией, без заливки.",
  "settingsCardFace.desc.shadow": "Огромный рельефный ранг с мягкой смещённой копией позади для глубины.",
  "settingsCardFace.desc.neon": "Только контур, с мягким свечением позади чёткой линии.",
  "settingsCardFace.desc.deco": "Двойная рамка в стиле ар-деко с угловыми метками вокруг тонкого ранга.",
  "settingsCardFace.desc.sketch": "Свободный рисованный вид — пунктирная рамка и слегка наклонённый ранг.",
  "settingsCardFace.desc.mono": "Спокойный моноширинный ранг над едва заметной сеткой базовых линий.",
  "settingsCardFace.desc.ribbon": "Диагональная лента несёт ранг наискосок через карту.",
  "settingsCardFace.desc.halo": "Масть находится внутри двух бледных концентрических колец, как мишень.",
  "settingsCardFace.desc.ledger": "Горизонтальные линии и ранг по правому краю, как столбец в бухгалтерской книге.",

  "settings.tip.title": "Переносится автоматически при входе",
  "settings.tip.body":
    "Тема, лицевая сторона карт, звук, сложность ИИ и все переключатели ниже синхронизируются с твоим аккаунтом — войди на другом устройстве (или после новой установки через «На экран «Домой»»), и они появятся и там. Если играешь без входа, всё сохраняется только в этом браузере. Не понимаешь, что делает какая-то настройка? Нажми на ⓘ рядом с ней.",

  "settings.section.notifications": "Уведомления",
  "settings.section.help": "Помощь",
  "settings.tab.general": "Общие",
  "settings.tab.display": "Экран",
  "settings.tab.audio": "Звук",
  "settings.tab.gameplay": "Игровой процесс",
  "settings.tab.accessibility": "Специальные возможности",
  "settings.tabsLabel": "Разделы настроек",
  "settings.resetSection": "Сбросить этот раздел",
  "settings.resetSectionConfirm": "Сбросить настройки этого раздела к значениям по умолчанию?",

  "settings.colorblind.title": "Карты для дальтоников",
  "settings.colorblind.description":
    "Сдвигает цвет красных и/или диких карт, чтобы их было легче различать — в зависимости от выбранного типа дальтонизма. Символы мастей (♥ ♦ ♣ ♠) показываются всегда, независимо от этой настройки.",
  "settings.colorblind.redSwatch": "Цвет красных карт",
  "settings.colorblind.wildSwatch": "Цвет диких карт",
  "settings.colorblind.off": "Выключено",
  "settings.colorblind.offDescription": "Стандартная красно-чёрная раскраска карт.",
  "settings.colorblind.protanopia": "Протанопия",
  "settings.colorblind.protanopiaDescription":
    "Красные карты становятся синими — их легче отличить от чёрных при протанопии (нечувствительности к красному).",
  "settings.colorblind.deuteranopia": "Дейтеранопия",
  "settings.colorblind.deuteranopiaDescription":
    "Красные карты становятся ярко-оранжевыми — их легче отличить от чёрных при дейтеранопии (нечувствительности к зелёному).",
  "settings.colorblind.tritanopia": "Тританопия",
  "settings.colorblind.tritanopiaDescription":
    "Дикие карты становятся из золотых пурпурными — их легче отличить от красных и чёрных при тританопии (нечувствительности к синему). Красные и чёрные карты остаются без изменений — их и так легко различить при этом типе.",

  "settings.textScale.title": "Размер текста",
  "settings.textScale.description":
    "Увеличивает большую часть текста сайта для удобства чтения — заголовки, основной текст, подписи полей, кнопки. Игровое поле специально не затрагивается: карты и элементы управления в игре всегда остаются обычного размера и никогда не выходят за границы. Работает и без входа в аккаунт.",
  "settings.textScale.default": "Обычный",
  "settings.textScale.defaultDescription": "Стандартный размер текста.",
  "settings.textScale.large": "Крупный",
  "settings.textScale.largeDescription": "Примерно на 15% крупнее — заметно легче читать с первого взгляда.",
  "settings.textScale.xlarge": "Очень крупный",
  "settings.textScale.xlargeDescription": "Примерно на 30% крупнее — для самого мелкого текста на странице.",

  "settings.soundEffects": "Звуковые эффекты",
  "settings.soundEffectsDescription":
    "Короткие звуки нажатия, скольжения и перезвона при взятии карт, сбросе, комбинациях и победе в раунде или игре.",
  "settings.sound.volume": "Громкость",
  "settings.sound.volumeDescription":
    "Насколько громкие звуковые эффекты. Переключатель «Звуковые эффекты» выше — главный выключатель.",
  "settings.sound.volumeAriaLabel": "Громкость звуковых эффектов",
  "settings.haptics": "Вибрация",
  "settings.hapticsDescription":
    "Короткие вибросигналы в те же моменты — независимо от звука, можно включить одно без другого.",
  "settings.ambientMusic": "Фоновая музыка",
  "settings.ambientMusicDescription":
    "Мягкая генеративная фоновая мелодия, пока открыт экран игры — отдельно от звуковых эффектов, можно включить одно без другого. По умолчанию выключена.",
  "settings.ambientVolume": "Громкость фона",
  "settings.ambientVolumeDescription":
    "Насколько громкая фоновая мелодия. Она остаётся деликатной даже на 100% — она задумана как звук на заднем плане.",
  "settings.ambientVolumeAriaLabel": "Громкость фоновой музыки",

  "settings.defaultAiDifficulty": "Сложность ИИ по умолчанию",
  "settings.defaultAiDifficultyDescription":
    "Используется как стартовая сложность, когда ты добавляешь ИИ-соперника на экране «Новая игра».",
  "settings.highlightLayoffs": "Подсвечивать возможные подкладки",
  "settings.highlightLayoffsDescription":
    "Отмечать значком карты в руке и верхнюю карту сброса, которые подходят к уже выложенной на столе комбинации, — так можно планировать заранее, ещё до того, как ты выложишь свой контракт.",
  "settings.showWhoseTurn": "Кнопка «Чей сейчас ход?»",
  "settings.showWhoseTurnDescription":
    "Показывать на игровом поле кнопку, которая на несколько секунд напоминает, чей сейчас ход.",
  "settings.showMeldHint": "Кнопка «Подсказка: авто-комбинация»",
  "settings.showMeldHintDescription":
    "Показывать кнопку, которая в один тап выкладывает твой контракт, если рука уже позволяет его собрать. По умолчанию выключена — в отличие от остальных подсказок выше, она играет часть твоего хода за тебя.",
  "settings.showLegalMoves": "Показывать возможные ходы",
  "settings.showLegalMovesDescription":
    "Подсвечивает, что ты можешь сделать: из каких стопок можно брать, куда можно подложить выбранную карту и насколько рука близка к контракту раунда. А ещё словами объясняет, почему кнопка неактивна.",
  "settings.confirmDiscard": "Подтверждать сброс",
  "settings.confirmDiscardDescription":
    "Перед каждым сбросом спрашивает «Сбросить … и закончить ход?». Если выключить, сброс делается одним касанием — но сброс завершает ход и его нельзя отменить.",
  "settings.gameSpeed": "Скорость игры",
  "settings.gameSpeedDescription":
    "Как быстро играют соперники и двигаются карты. «Спокойно» замедляет всё, «Быстро» сокращает паузы, «Мгновенно» пропускает ожидание и анимации карт. Ещё можно коснуться экрана во время хода соперника, чтобы пропустить паузу.",
  "settings.gameSpeed.relaxed": "Спокойно",
  "settings.gameSpeed.normal": "Обычно",
  "settings.gameSpeed.fast": "Быстро",
  "settings.gameSpeed.instant": "Мгновенно",
  "settings.reduceMotion": "Уменьшить анимацию",
  "settings.reduceMotionDescription":
    "Отключает полёт карт, конфетти, пульсирующую подсветку и большинство переходов во всём приложении. «Как на устройстве» следует системной настройке уменьшения движения; «Всегда уменьшать» действует независимо от неё.",
  "settings.reduceMotion.system": "Как на устройстве",
  "settings.reduceMotion.on": "Всегда уменьшать",

  "settings.turnNotifications": "Уведомления о ходе",
  "settings.turnNotificationsDescription":
    "Push-уведомление, когда наступает твой ход в сетевой игре, а также — если вот-вот прервётся серия «Расклада дня» — напоминание сыграть, пока она не сгорела. Работает после добавления этой страницы на главный экран или установки как приложения; само разрешение контролирует твой браузер. По умолчанию выключено.",
  "settings.howToAddToHomeScreen": "Как добавить на главный экран?",
  "settings.androidChrome": "Android (Chrome)",
  "settings.android.step1": "Нажми на значок ⋮ (в правом верхнем углу).",
  "settings.android.step2": "Нажми «Добавить на главный экран».",
  "settings.android.step3": "Нажми «Добавить», чтобы подтвердить.",
  "settings.iosSafari": "iPhone/iPad (Safari)",
  "settings.ios.step1": "Нажми на значок «Поделиться» (квадрат со стрелкой, внизу экрана).",
  "settings.ios.step2": "Прокрути вниз и нажми «На экран «Домой»».",
  "settings.ios.step3": "Нажми «Добавить» (в правом верхнем углу), чтобы подтвердить.",
  "settings.homeScreenNote":
    "В любом случае в дальнейшем открывай игру с нового значка на главном экране, а не через браузер.",
  "settings.push.iosUnsupported":
    "На iPhone/iPad это работает только после добавления страницы на главный экран — нажми на значок «Поделиться», затем «На экран «Домой»», а потом открой игру оттуда.",
  "settings.push.unsupported": "Не поддерживается в этом браузере.",
  "settings.push.blocked":
    "Заблокировано в настройках уведомлений браузера для этого сайта — разреши их там, чтобы снова включить эту функцию.",

  "settings.firstVisitTips": "Подсказки при первом посещении",
  "settings.firstVisitTipsDescription": "Вернуть скрытые подсказки на главной, в «Новой игре» и на нескольких других страницах.",
  "settings.doneCheck": "Готово ✓",
  "settings.showAgain": "Показать снова",
  "settings.foundBug": "Что-то работает не так? Есть идея?",
  "settings.foundBugDescription": "Отправь отчёт об ошибке или предложение.",
  "settings.contactUs": "Связаться с нами",
  "settings.enjoying": "Нравится игра?",
  "settings.enjoyingDescription": "Необязательный разовый донат — никогда не обязателен и никак не влияет на игру.",
  "settings.supportDeveloper": "Поддержать разработчика",

  "settings.resetConfirm": "Сбросить тему, рубашку карт, режим для дальтоников и все переключатели на этой странице к значениям по умолчанию?",
  "settings.yesReset": "Да, сбросить",
  "settings.resetToDefaults": "Сбросить настройки",

  "contract.book.one": "{count} сет",
  "contract.book.few": "{count} сета",
  "contract.book.many": "{count} сетов",
  "contract.book.other": "{count} сета",
  "contract.run.one": "{count} стрит",
  "contract.run.few": "{count} стрита",
  "contract.run.many": "{count} стритов",
  "contract.run.other": "{count} стрита",

  "hand.sortBySuit": "Сортировать по масти",
  "hand.sortBySuitHint": "Сгруппировать карты одной масти — удобно для составления стритов",
  "hand.sortByRank": "Сортировать по достоинству",
  "hand.sortByRankHint": "Сгруппировать карты одного достоинства — удобно для составления сетов",

  "common.muteSound": "Выключить звук",
  "common.unmuteSound": "Включить звук",
  "common.dismiss": "Закрыть",

  "unlockToast.unlocked.one": "Открыта новая награда профиля!",
  "unlockToast.unlocked.few": "Открыты новые награды профиля!",
  "unlockToast.unlocked.many": "Открыты новые награды профиля!",
  "unlockToast.unlocked.other": "Открыты новые награды профиля!",
  "unlockToast.goEquip": "Перейти и экипировать →",

  "card.joker": "ДЖОКЕР",
  "card.jokerAbbr": "ДЖК",
  "card.rank.ace": "Туз",
  "card.rank.king": "Король",
  "card.rank.queen": "Дама",
  "card.rank.jack": "Валет",
  "card.suit.hearts": "червей",
  "card.suit.diamonds": "бубен",
  "card.suit.clubs": "треф",
  "card.suit.spades": "пик",
  "card.label": "{rank} {suit}",
  "card.labelWild": "{rank} {suit}, дикая",

  "common.remove": "Удалить",
  "common.on": "Вкл",
  "common.off": "Выкл",
  "common.howToPlay": "Как играть",

  "game.meld.book": "Сет",
  "game.meld.run": "Стрит",
  "game.buildMeld.heading": "Собери комбинацию — в этом раунде нужно: {need}",
  "game.buildMeld.wholeHandNotice":
    "Это финальный раунд — после сбора комбинации сброса не будет, поэтому все карты из руки должны войти в эти стриты.",
  "game.buildMeld.notYetGrouped.one": "{count} карта ещё не сгруппирована.",
  "game.buildMeld.notYetGrouped.few": "{count} карты ещё не сгруппированы.",
  "game.buildMeld.notYetGrouped.many": "{count} карт ещё не сгруппировано.",
  "game.buildMeld.notYetGrouped.other": "{count} карты ещё не сгруппировано.",
  "game.buildMeld.wildPrompt": "Какую карту заменяет эта дикая карта?",
  "game.buildMeld.wildPromptShort": "Какую карту заменяет эта дикая карта?",
  "game.buildMeld.groupSelected": "Сгруппировать выбранные карты",
  "game.buildMeld.confirmMeld": "Подтвердить комбинацию",
  "game.buildMeld.hintTitle": "Автоматически выкладывает твой контракт, если рука уже позволяет собрать его прямо сейчас",
  "game.buildMeld.hintButton": "💡 Подсказка: авто-комбинация",
  "game.buildMeld.invalidGroup": "Это не сет и не стрит.",
  "game.buildMeld.confirmMeldFailed": "Не удалось выложить эти группы — проверь, что они всё ещё соответствуют контракту этого раунда.",

  "game.discard.confirmPrompt": "Сбросить карту {card} и завершить ход?",
  "game.discard.layOffCard.one": "Подложить карту",
  "game.discard.layOffCard.few": "Подложить карты",
  "game.discard.layOffCard.many": "Подложить карты",
  "game.discard.layOffCard.other": "Подложить карты",
  "game.discard.discardSelected": "Сбросить выбранную карту",

  "game.hand.yourHand": "Твоя рука",
  "game.hand.playerHand": "Рука игрока {name}",
  "game.hand.pts": "{count} очк.",
  "game.hand.contractMelded": "— контракт выложен",
  "game.hand.dragToReorder": "Перетащи карту, чтобы изменить порядок в руке.",

  "game.whoseTurn": "Чей сейчас ход?",
  "game.jennysTurn": "Сейчас ход Дженни!",
  "game.roundOf": "Раунд {round} из {total}",
  "game.levelBadge": "Ур.{level}",
  "game.undoBanner.confirmed": "Комбинация или подкладка подтверждена.",
  "game.undoBanner.undo": "Отменить",
  "game.draw": "Взять ({count})",
  "game.discardPile": "Стопка сброса",
  "game.waitingFor": "Ожидание игрока {name}",
  "game.drawFromPile": "Взять из колоды",
  "game.drawFromDiscard": "Взять из сброса",
  "game.drawToStart": "Возьми карту из колоды или из сброса, чтобы начать ход.",
  "game.tableMelds.heading": "Комбинации на столе",
  "game.tableMelds.empty":
    "Пока ничего не выложено — собери контракт этого раунда, чтобы выложить сюда первые сеты и стриты.",
  "game.manageHand": "Управление рукой",
  "game.jumpToHand": "Перейти к руке",

  "game.announce.yourTurn": "Твой ход.",
  "game.announce.playerTurn": "Ход игрока {name}.",
  "game.announce.youDrew": "Взята карта: {card}.",

  "game.layOff.errorNotDrawn": "Сначала возьми карту, потом подкладывай.",
  "game.layOff.errorNotMelded": "Сначала выложи свой контракт, потом подкладывай карты.",
  "game.layOff.errorMultiple":
    "Эти карты нельзя подложить туда все вместе — попробуй выбрать их заново или подкладывай по одной.",
  "game.layOff.errorSingle": "Эту карту туда больше нельзя подложить — попробуй выбрать её заново.",
  "game.skipWait": "Пропустить ожидание",
  "game.discardToPile": "Сбросить выбранную карту в стопку",
  "game.turnHint.drawn": "Собери комбинацию или выбери карту и сбрось её, чтобы закончить ход.",
  "game.turnHint.melded":
    "Подкладывай карты к комбинациям, затем сбрось карту, чтобы закончить ход.",
  "game.progress.books": "Сеты: готово {ready} из {need}",
  "game.progress.runs": "Стриты: готово {ready} из {need}",
  "game.progress.closestBook": "ближе всего: {rank} ({have}/{need})",
  "game.progress.closestRun": "ближе всего: {suit} ({have}/{need})",
  "game.progress.ready": "Твоя рука уже позволяет выложить контракт этого раунда.",
  "game.why.drawFirst": "Сначала возьми карту.",
  "game.why.finishWildChoice": "Сначала выбери, что заменяет джокер.",
  "game.why.tooManyGroups": "Групп собрано больше, чем нужно в этом раунде — убери одну.",
  "game.why.groupMore": "Собери {need}, чтобы подтвердить комбинацию.",
  "game.why.groupAll":
    "В этом раунде нужно выложить все карты — ещё {count} не сгруппировано.",
  "game.why.selectToDiscard": "Выбери карту для сброса.",
  "game.why.selectOneToDiscard": "Выбери для сброса только одну карту.",
  "game.why.selectToLayOff": "Выбери карту, которую хочешь подложить.",
  "game.why.noLayOffTarget": "Ни одна комбинация на столе не принимает эту карту.",
  "game.why.pickMeld": "Подходит несколько комбинаций — выбери одну на столе.",
  "game.hand.ptsExplain":
    "Штрафные очки, которые ты получишь, если кто-то закончит прямо сейчас — чем меньше, тем лучше.",

  "signIn.title": "Вход",
  "signIn.notSetUp.title": "Вход пока не настроен",
  "signIn.notSetUp.body":
    "К этому приложению не подключён проект Supabase. Локальные игры «передай и играй» отлично работают и без него — просто аккаунты и статистика пока недоступны.",
  "signIn.alreadyRegistered":
    "Для этого email уже есть аккаунт. Попробуй войти или воспользуйся ссылкой «Не помнишь пароль?», если не помнишь пароль.",
  "signIn.mfaPrompt": "Введи 6-значный код из приложения-аутентификатора.",
  "signIn.verifying": "Проверка…",
  "signIn.verify": "Проверить",
  "signIn.or": "или",
  "signIn.magic.button": "Отправить ссылку для входа на почту",
  "signIn.magic.sent":
    "Мы отправили ссылку для входа на {email}. Открой её на этом устройстве, чтобы завершить вход. Если в письме есть 6-значный код, можешь ввести его ниже.",
  "signIn.magic.codeLabel": "6-значный код из письма",
  "signIn.magic.codePlaceholder": "123456",
  "signIn.magic.needEmail": "Сначала введи адрес электронной почты.",
  "signIn.oauth.continueWith": "Продолжить через {provider}",
  "signIn.checkEmail": "Проверь почту (включая папку «Спам»), чтобы подтвердить аккаунт, а потом вернись и войди.",
  "signIn.backToSignIn": "Назад ко входу",
  "signIn.resetEmailSent": "Если для {email} есть аккаунт, мы отправили на него ссылку для сброса пароля.",
  "signIn.email": "Email",
  "signIn.password": "Пароль",
  "signIn.createAccount": "Создать аккаунт",
  "signIn.sendResetLink": "Отправить ссылку для сброса",
  "signIn.forgotPassword": "Не помнишь пароль?",
  "signIn.needAccount": "Нет аккаунта? Зарегистрироваться",
  "signIn.alreadyHaveAccount": "Уже есть аккаунт? Войти",
  "signIn.agreePrefix": "Продолжая, ты принимаешь наши",
  "signIn.agreeAnd": "и",
  "signIn.privacyPolicy": "Политику конфиденциальности",

  "multiplayer.signInToPlay": "Войди, чтобы играть",
  "multiplayer.loadError": "Не удалось загрузить эту игру.",
  "multiplayer.cancelled.title": "Игра отменена",
  "multiplayer.cancelled.body": "Кто-то отклонил приглашение до начала игры.",
  "multiplayer.dealing": "Раздача карт…",
  "multiplayer.waitingForPlayers": "Ожидание игроков",
  "multiplayer.dealingBody": "Игра настраивается — эта страница обновится автоматически.",
  "multiplayer.waitingForPlayersBody": "Игра начнётся, как только все приглашённые примут приглашение.",
  "multiplayer.someone": "Кто-то",
  "multiplayer.someoneLower": "кто-то",
  "multiplayer.accepted": "Принято",
  "multiplayer.waiting": "Ожидание",
  "multiplayer.accepting": "Принятие…",
  "multiplayer.accept": "Принять",
  "multiplayer.declining": "Отклонение…",
  "multiplayer.decline": "Отклонить",
  "common.refresh": "Обновить",
  "multiplayer.cancelling": "Отмена…",
  "multiplayer.cancelThisGame": "Отменить эту игру",
  "multiplayer.youWon": "Победа!",
  "multiplayer.playerWon": "Победитель: {name}",
  "multiplayer.nobody": "Никто",
  "multiplayer.left": "(вышел)",
  "multiplayer.leftPending": "Вышел из игры · +{penalty} в конце раунда",
  "multiplayer.recordedToStats": "Записано в твою статистику и результаты сетевых игр.",
  "multiplayer.achievementUnlocked.one": "Открыто достижение",
  "multiplayer.achievementUnlocked.few": "Открыты достижения",
  "multiplayer.achievementUnlocked.many": "Открыты достижения",
  "multiplayer.achievementUnlocked.other": "Открыты достижения",
  "multiplayer.tournamentRound": "Раунд {round} турнира — посмотреть турнирную таблицу →",
  "multiplayer.settingUp": "Настройка…",
  "multiplayer.rematch": "Реванш — с теми же игроками",
  "multiplayer.leaveConfirm": "Покинуть эту игру? Тебе будет засчитано поражение.",
  "multiplayer.leave": "Покинуть",
  "multiplayer.resignTitle": "Покинуть эту игру?",
  "multiplayer.resignBody":
    "Тебе засчитают поражение: рука сбрасывается, ты получаешь фиксированный штраф и занимаешь последнее место, а игра продолжается без тебя. Отменить это нельзя.",
  "multiplayer.resignConfirm": "Покинуть и сдаться",
  "multiplayer.playingAsync": "Игра в своём темпе",
  "multiplayer.playingAsyncBody":
    "Не обязательно быть в сети одновременно. Сделай ход — и очередь переходит следующему игроку; загляни на главную позже или включи уведомления в настройках, чтобы узнать, когда снова наступит твой ход.",
  "multiplayer.roundSummary.heading": "Раунд {round} · {label}",
  "multiplayer.roundSummary.leftPenalty": "вышел · штраф +{penalty}",
  "multiplayer.seatN": "Место {seat}",
  "multiplayer.roundSummary.nextRound": "Раунд {round} уже идёт — сделай свой ход ниже, когда наступит очередь.",
  "multiplayer.waitingForTurn.prefix": "Ожидаем, когда",
  "multiplayer.waitingForTurn.suffix": "сделает ход.",
  "multiplayer.nudged": "Напоминание отправлено 👍",
  "multiplayer.cantNudgeYet": "Пока нельзя напомнить",
  "multiplayer.nudgeName": "Напомнить {name}",
  "multiplayer.abandonedNotice":
    "Нет ходов уже {days} дней. Если игра заброшена, заверши её кнопкой «Сдаться» выше.",
  "multiplayer.yourTurnDraw": "Твой ход — возьми карту, чтобы начать.",
  "multiplayer.takeDiscardTop": "Взять верхнюю карту сброса",
  "multiplayer.noMeldsThisRound": "В этом раунде ещё ничего не выложено.",
  "multiplayer.drawFirst": "Сначала возьми карту, чтобы начать ход.",
  "multiplayer.contractStatus": "Контракт: {stagedBooks}/{books} сетов · {stagedRuns}/{runs} стритов",
  "multiplayer.card": "карта",
  "multiplayer.goOut": "Выйти",
  "multiplayer.syncError": "Не удалось обновить — показано последнее известное состояние игры.",
  "multiplayer.handEmpty": "Твоя рука пуста — заверши ход, чтобы выйти.",

  "common.close": "Закрыть",
  "shortcuts.title": "Горячие клавиши и геймпад",
  "shortcuts.openHelp": "Горячие клавиши",
  "shortcuts.keyboardHeading": "Клавиатура",
  "shortcuts.moveFocus": "Перемещение между картами и кнопками",
  "shortcuts.selectCard": "Выбрать / снять выбор с карты в фокусе",
  "shortcuts.draw": "Взять из колоды",
  "shortcuts.drawDiscard": "Взять верхнюю карту сброса",
  "shortcuts.focusHand": "Перейти к своей руке",
  "shortcuts.group": "Сгруппировать / подтвердить комбинацию / подложить",
  "shortcuts.discard": "Сбросить выбранную карту",
  "shortcuts.sortRank": "Сортировать руку по рангу",
  "shortcuts.sortSuit": "Сортировать руку по мастям",
  "shortcuts.undo": "Отменить последнюю комбинацию или подкладывание",
  "shortcuts.help": "Показать эту справку",
  "shortcuts.close": "Закрыть окна и меню",
  "shortcuts.typingNote": "Горячие клавиши не работают, пока ты печатаешь в текстовом поле.",
  "shortcuts.gamepadHeading": "Геймпад",
  "shortcuts.gamepad.move": "Крестовина / левый стик — перемещение фокуса",
  "shortcuts.gamepad.select": "A — выбрать / подтвердить",
  "shortcuts.gamepad.back": "B — назад / отмена",
  "shortcuts.gamepad.draw": "X — взять из колоды",
  "shortcuts.gamepad.sort": "Y — сортировать руку",
  "shortcuts.gamepad.zones":
    "LB / RB — переход между рукой, стопками и столом; LT — группа/комбинация, RT — сброс",
  "shortcuts.gamepad.help": "Start — эта справка",
  "gamepad.select": "Выбор",
  "gamepad.back": "Назад",
  "gamepad.draw": "Взять",
  "gamepad.sort": "Сорт.",
  "gamepad.zones": "Зоны",
  "gamepad.help": "Справка",

  "opponentStrip.thinking": "{name} думает…",
  "opponentStrip.cardsInHand.one": "{count} карта",
  "opponentStrip.cardsInHand.few": "{count} карты",
  "opponentStrip.cardsInHand.many": "{count} карт",
  "opponentStrip.cardsInHand.other": "{count} карты",
  "opponentStrip.chipLabel": "{name}, карт в руке: {cards}",
  "opponentStrip.chipLabelActive": "{name}, карт в руке: {cards}, сейчас ходит",
  "opponentStrip.inHandSuffix": "в руке",
  "opponentStrip.lastDiscard": "Последний сброс",
  "opponentStrip.lastPickup": "Последнее взятие",

  "roundSummary.complete": "Раунд {round} завершён",
  "roundSummary.wentOut": "Игрок {name} завершил раунд!",
  "roundSummary.xpGained": "+{xp} XP",
  "roundSummary.levelUp": "— Новый уровень! Теперь уровень {level}",
  "roundSummary.achievementsUnlocked.one": "Достижение открыто в этом раунде",
  "roundSummary.achievementsUnlocked.few": "Достижения открыты в этом раунде",
  "roundSummary.achievementsUnlocked.many": "Достижения открыты в этом раунде",
  "roundSummary.achievementsUnlocked.other": "Достижения открыты в этом раунде",
  "roundSummary.player": "Игрок",
  "roundSummary.thisRound": "Этот раунд",
  "roundSummary.total": "Итого",
  "roundSummary.leading": "Лидирует",
  "roundSummary.startNextRound": "Начать следующий раунд",

  "common.difficulty.beginner": "новичок",
  "common.difficulty.easy": "лёгкий",
  "common.difficulty.medium": "средний",
  "common.difficulty.hard": "сложный",
  "common.difficulty.expert": "эксперт",

  "gameOver.xp.finished": "Игра завершена",
  "gameOver.xp.won": "Победа",
  "gameOver.xp.beatDifficulty": "ИИ уровня «{difficulty}» обыгран",
  "gameOver.xp.achievementsUnlocked": "Открыты достижения",
  "gameOver.share.tied": "{names} сыграли вничью в Books & Runs!",
  "gameOver.share.won": "Игрок {name} победил в Books & Runs!",
  "gameOver.share.copied": "Скопировано в буфере обмена ✓",
  "gameOver.share.copyError": "Не удалось скопировать — попробуй ещё раз",
  "gameOver.share.button": "Поделиться результатом",
  "gameOver.tutorialComplete": "Обучение пройдено",
  "gameOver.dailyDeal": "Расклад дня",
  "gameOver.weeklyChallenge": "Испытание недели",
  "gameOver.gameOver": "Игра окончена",
  "gameOver.niceWork": "Отличная работа!",
  "gameOver.tied": "{names} сыграли вничью!",
  "gameOver.won": "Победитель — {name}!",
  "gameOver.tutorialBody":
    "Ты только что сыграл целый раунд — взятие карт, сборку комбинаций, сброс и всё, что между ними. Этот тренировочный раунд не учитывался в статистике и достижениях. Готов сыграть по-настоящему?",
  "gameOver.scoring.heading": "Как считаются очки",
  "gameOver.scoring.body":
    "Чем меньше, тем лучше. Штрафные очки начисляются только за карты, оставшиеся на руке к концу раунда — всё выложенное или подложенное не считается. В полной игре побеждает тот, у кого после всех раундов наименьшая общая сумма очков.",
  "gameOver.scoring.numbers": "3–9: по 5 очков",
  "gameOver.scoring.faceCards": "10, В, Д, К: по 10 очков",
  "gameOver.scoring.ace": "Туз: по 15 очков",
  "gameOver.scoring.wild": "Дикая карта (2): по 20 очков",
  "gameOver.scoring.jokerCard": "Джокер: по 50 очков",
  "gameOver.dayStreak.one": "{count} день подряд",
  "gameOver.dayStreak.few": "{count} дня подряд",
  "gameOver.dayStreak.many": "{count} дней подряд",
  "gameOver.dayStreak.other": "{count} дня подряд",
  "gameOver.bestStreakDaily": "Лучшая серия: {best}. Возвращайся завтра за следующей.",
  "gameOver.signInForStreak": "Войди, чтобы начать серию — она привязана к аккаунту, поэтому без входа она не засчитывается.",
  "gameOver.weekStreak.one": "{count} неделя подряд",
  "gameOver.weekStreak.few": "{count} недели подряд",
  "gameOver.weekStreak.many": "{count} недель подряд",
  "gameOver.weekStreak.other": "{count} недели подряд",
  "gameOver.bestStreakWeekly": "Лучшая серия: {best}. Новое испытание появится на следующей неделе.",
  "gameOver.shieldEarned": "Щит серии теперь твой! Он закроет пропущенный день, если понадобится.",
  "gameOver.shieldUsed": "Щит закрыл вчерашний день, и серия продолжается.",
  "gameOver.shieldEarnedWeekly": "Недельный щит теперь твой! Он закроет пропущенную неделю, если понадобится.",
  "gameOver.shieldUsedWeekly": "Щит закрыл прошлую неделю, и серия продолжается.",
  "gameOver.friendsHeading": "Расклад дня · друзья",
  "gameOver.you": "Ты",
  "gameOver.notSaved": "Эта игра не была сохранена",
  "gameOver.notSavedBody":
    "Войди, чтобы сохранять прогресс уровня и достижений, попадать в таблицу лидеров и играть по сети с друзьями.",
  "gameOver.statsNotTracked": "Статистика для этой игры не отслеживалась — эта опция была отключена на экране «Новая игра».",
  "gameOver.saving": "Сохранение в статистику…",
  "gameOver.saved": "Сохранено в статистику.",
  "gameOver.saveError": "Не удалось сохранить в статистику — проверь подключение.",
  "gameOver.xpLine": "+{amount} XP — {label}",
  "gameOver.dailyXp": "+{xp} XP за расклад дня",
  "gameOver.weeklyXp": "+{xp} XP за испытание недели",
  "gameOver.streakBonus": "+{xp} XP бонус за серию · {days} дн.",
  "gameOver.levelUp": "Новый уровень! Теперь уровень {level}",
  "gameOver.xp.quest": "Задание: {quest}",
  "gameOver.playRealGame": "Сыграть настоящую игру",
  "gameOver.playAgain": "Играть снова",

  "tutorial.stepOf": "Шаг {step} из {total}",
  "tutorial.skip": "Пропустить обучение",
  "tutorial.tryIt": "↑ Попробуй сам",
  "tutorial.gotIt": "Понятно →",

  "tutorial.welcome.title": "Добро пожаловать в Books & Runs!",
  "tutorial.welcome.body":
    "Это короткое знакомство проведёт тебя через первый ход и покажет, где что находится на экране. Это займёт всего минуту — начнём.",
  "tutorial.contract.title": "Контракт этого раунда",
  "tutorial.contract.body":
    "Сверху: какой сейчас раунд и какой контракт нужно выполнить. Каждый раунд требует определённого набора комбинаций, прежде чем можно будет что-то выложить. В этом раунде это 1 сет + 1 стрит.",
  "tutorial.opponents.title": "Стол",
  "tutorial.opponents.body":
    "Эта полоса — все участники игры: их метка, сколько карт у них на руке и чей сейчас ход (он подсвечен). Нажми на любого игрока, чтобы увидеть его последний сброс и последнее взятие. Когда соперник делает ход, результат сразу появляется здесь.",
  "tutorial.handBar.title": "Твоя рука",
  "tutorial.handBar.body":
    "Твои карты лежат в этой полосе внизу экрана — всегда в одном тапе от тебя. Разверни её на весь экран, чтобы сортировать руку, собирать комбинации и сбрасывать карты — это мы сейчас и сделаем.",
  "tutorial.draw.title": "Возьми карту",
  "tutorial.draw.body":
    "Каждый ход начинается со взятия карты. Нажми на колоду, чтобы взять новую карту, или возьми верхнюю карту сброса, если она пригодится твоей руке. Попробуй прямо сейчас.",
  "tutorial.hand.title": "Твоя рука целиком",
  "tutorial.hand.body":
    "Вот всё, что у тебя на руках, развёрнуто полностью. У тебя уже есть всё, что нужно для контракта этого раунда, — сет и стрит уже здесь, просто нужно их найти.",
  "tutorial.organizeHand.title": "Наведи порядок в руке",
  "tutorial.organizeHand.body":
    "Нажми «Сортировать по масти» или «Сортировать по достоинству», чтобы сгруппировать карты автоматически, или зажми и перетащи любую карту туда, куда захочешь. Это только для твоего удобства — на игру это никак не влияет.",
  "tutorial.wildcards.title": "Дикие карты",
  "tutorial.wildcards.body":
    "Джокеры всегда дикие. Двойки универсальны — двойка может заменить любую недостающую карту или сыграть как обычная карта своего достоинства, смотря что нужнее. В этом раунде ни того, ни другого у тебя на руке нет, но если позже ты подложишь дикую карту к стриту, тебя могут спросить, какую карту она заменяет.",
  "tutorial.book.title": "Собери сет",
  "tutorial.book.body": "Сет — это 3 и более карты одного достоинства. Нажми на свои три семёрки, затем нажми «Сгруппировать выбранные карты».",
  "tutorial.run.title": "Собери стрит",
  "tutorial.run.body":
    "Стрит — это 4 и более карты одной масти по порядку. Нажми на свои 3, 4, 5 и 6 пик, затем снова нажми «Сгруппировать выбранные карты».",
  "tutorial.confirm.title": "Выложи их",
  "tutorial.confirm.body":
    "Твой сет и стрит точно соответствуют контракту раунда. Нажми «Подтвердить комбинацию», чтобы выложить их на стол.",
  "tutorial.tableMelds.title": "Комбинации на столе",
  "tutorial.tableMelds.body":
    "Вот они — выложены так, чтобы все игроки их видели, и сгруппированы по владельцам. Как только контракт выложен, он остаётся на столе — дальше ты только дополняешь его.",
  "tutorial.layoffHint.title": "Подкладка карт",
  "tutorial.layoffHint.body":
    "Когда твой контракт выложен, ты можешь подкладывать отдельные карты к любой комбинации на столе — своей или чужой. Следи за маленьким значком ↓ на карте: он значит, что эта карта куда-то подходит. В этот ход подходящих карт нет, но держи это в уме на будущее. Эту подсказку можно отключить в настройках.",
  "tutorial.discard.title": "Заверши ход",
  "tutorial.discard.body":
    "Каждый ход заканчивается сбросом. Нажми на одну карту в руке, затем «Сбросить выбранную карту», затем «Подтвердить».",
  "tutorial.wrapup.title": "Вот и весь цикл",
  "tutorial.wrapup.body":
    "Взял карту, собрал комбинацию, сбросил — и так каждый ход. Раунд заканчивается, когда первый игрок опустошает руку; все остальные получают штраф за карты, оставшиеся у них на руках. Дальше ИИ уровня «Новичок» будет ходить автоматически — доиграй раунд до конца и посмотри, что получится. Удачи!",

  "passGate.passTo": "Передай устройство игроку",
  "passGate.ready": "Готово — показать мою руку",

  "buyOfferGate.prompt": "Купить этот сброс? Ты возьмёшь его, а также одну штрафную карту из колоды.",
  "buyOfferGate.noThanks": "Нет, спасибо",
  "buyOfferGate.buyIt": "Купить",

  "common.privacy": "Конфиденциальность",
  "common.terms": "Условия",
  "common.contact": "Контакты",

  "home.newGame": "Новая игра",
  "home.tapToSkip": "Нажмите, чтобы пропустить",
  "home.passAndPlay": "Передай и играй",
  "home.solo": "Соло",
  "home.nPlayers.one": "{count} игрок",
  "home.nPlayers.few": "{count} игрока",
  "home.nPlayers.many": "{count} игроков",
  "home.nPlayers.other": "{count} игрока",
  "home.vsDifficultyAi": "против ИИ уровня «{difficulty}»",
  "home.vsAiOpponents.one": "против {count} ИИ-соперника",
  "home.vsAiOpponents.few": "против {count} ИИ-соперников",
  "home.vsAiOpponents.many": "против {count} ИИ-соперников",
  "home.vsAiOpponents.other": "против {count} ИИ-соперников",
  "home.xpToLevel": "{into} / {span} XP до уровня {next}",
  "home.levelN": "Уровень {level}",
  "home.signedInAs": "Вход выполнен: {email}",
  "home.welcomeTip.title": "Добро пожаловать в Books & Runs",
  "home.welcomeTip.body":
    "Бесплатная карточная игра «Контрактный Рамми» — собирай сеты, выкладывай стриты, побеждай с наименьшим счётом. Нажми «Новая игра», чтобы начать; при первом настоящем раунде тебя проведёт короткое обучение. Войди в аккаунт, чтобы отслеживать статистику и достижения на всех устройствах.",

  "home.dailyDeal.title": "Расклад дня",
  "home.dailyDeal.signInHint": "Войди, чтобы вести серию побед — сыграть сегодняшний расклад может кто угодно.",
  "home.dailyDeal.streak": "🔥 {count} дн. подряд",
  "home.dailyDeal.oneSeeded": "Один заданный расклад — сегодня он одинаковый для всех.",
  "home.dailyDeal.streakProtected": "Серия защищена на сегодня.",
  "home.dailyDeal.shieldCovering": "Твоя серия под защитой щита.",
  "home.dailyDeal.continue": "Продолжить сегодняшний расклад",
  "home.dailyDeal.play": "Сыграть сегодняшний расклад",
  "home.leftInProgress": "Эта игра осталась незавершённой.",
  "home.playAgain": "Играть снова",

  "home.weeklyChallenge.title": "Испытание недели",
  "home.weeklyChallenge.signInHint": "Войди, чтобы вести серию побед — сыграть испытание этой недели может кто угодно.",
  "home.weeklyChallenge.streak": "🏆 {count} нед. подряд",
  "home.weeklyChallenge.description": "Полная игра на 7 раундов против 3 ИИ уровня «Сложный» — на этой неделе стол одинаковый для всех.",
  "home.weeklyChallenge.streakProtected": "Серия защищена на эту неделю.",
  "home.weeklyChallenge.shieldCovering": "Твоя серия под защитой щита.",
  "home.weeklyChallenge.continue": "Продолжить испытание этой недели",
  "home.weeklyChallenge.play": "Сыграть испытание этой недели",

  "home.progressTile.profile": "Профиль",
  "home.progressTile.achievements": "Достижения",
  "home.progressTile.leaderboard": "Таблица лидеров",
  "home.progressTile.friends": "Друзья",

  "home.closestAchievement": "Ближайшее достижение",
  "home.reward.badge": "значок {name}",
  "home.reward.avatar_frame": "рамка «{name}»",
  "home.reward.title": "титул «{name}»",
  "home.reward.banner": "баннер «{name}»",
  "home.nextReward": "Следующая награда на уровне {level}: {reward}",
  "home.nextRewardMore": "Следующая награда на уровне {level}: {reward} и ещё {count}",
  "quests.title": "Задания",
  "quests.daily": "Сегодня",
  "quests.weekly": "На этой неделе",
  "quests.resets": "Новые задания через {time}",
  "quests.time.dh": "{d} д {h} ч",
  "quests.time.hm": "{h} ч {m} мин",
  "quests.time.m": "{m} мин",
  "quests.progress": "{progress} / {target}",
  "quests.xp": "+{xp} XP",
  "quests.signInHint": "Войди, чтобы получать XP за задания.",
  "quests.toast.title": "Задание выполнено!",
  "quests.toast.line": "{quest} · +{xp} XP",
  "quests.metric.gamesPlayed": "Доиграть партии",
  "quests.metric.gamesWon": "Выиграть партии",
  "quests.metric.booksMelded": "Выложить сеты",
  "quests.metric.runsMelded": "Выложить стриты",
  "quests.metric.cardsLaidOff": "Добавить карты к комбинациям",
  "quests.metric.roundsWon": "Выиграть раунды, выйдя первым",
  "quests.metric.roundsWonNoDiscard": "Выйти без сброса",
  "quests.metric.meldsWithZeroWilds": "Выложить без диких карт",
  "quests.metric.cardsDrawnFromDiscard": "Взять карту из сброса",
  "quests.metric.oversizedRunsMelded": "Выложить стриты длиннее нужного",
  "quests.metric.wildsUsedInMelds": "Использовать дикие карты в комбинациях",
  "welcomeBack.title": "С возвращением!",
  "welcomeBack.gamesWaiting.one": "{count} игра ждёт твоего хода",
  "welcomeBack.gamesWaiting.other": "{count} игры ждут твоего хода",
  "welcomeBack.streak": "Твоя серия «Расклада дня» — {count} дн. подряд — продолжается: сегодняшний расклад готов.",
  "welcomeBack.dailyReady": "Сегодняшний расклад дня готов — играй, когда захочешь.",
  "welcomeBack.quests": "Новые задания уже ждут.",
  "streakShield.label": "Щиты серии: {count} из {max}",
  "streakShield.dailyExplainer": "Каждые 7 дней серии ты получаешь щит (держать можно до 2). Он незаметно закроет один пропущенный день.",
  "streakShield.weeklyExplainer": "Щит выдаётся за серию в 4 недели (держать можно 1). Он незаметно закроет одну пропущенную неделю.",
  "notifications.title": "Уведомления",
  "notifications.bellCount": "Уведомления, новых: {count}",
  "notifications.friends.one": "{count} заявка в друзья",
  "notifications.friends.few": "{count} заявки в друзья",
  "notifications.friends.many": "{count} заявок в друзья",
  "notifications.friends.other": "{count} заявки в друзья",
  "notifications.empty": "Всё просмотрено",
  "notifications.emptyHint": "Здесь появятся новые ходы, приглашения и заявки в друзья.",
  "notifications.settings": "Настройки уведомлений",
  "notifications.pushTitle": "Получай уведомление, когда твой ход",
  "notifications.pushEnable": "Включить",
  "notifications.pushBusy": "Включаем…",
  "notifications.pushError": "Не удалось включить уведомления. Проверь настройки браузера.",
  "streakShield.savedTitle": "Щит спас твою серию",
  "streakShield.savedBody": "Один день ускользнул, и щит пришёл на выручку. Твоя серия в {count} дн. продолжается.",
  "welcomeBack.shieldSaved": "Щит закрыл пропущенный день, так что твоя серия в {count} дн. в безопасности.",
  "welcomeBack.gamesWaiting.few": "{count} игры ждут твоего хода",
  "welcomeBack.gamesWaiting.many": "{count} игр ждут твоего хода",

  "home.more": "Ещё",
  "home.playWithFriends": "Играть с друзьями",
  "home.clubs": "Клубы",
  "home.tournaments": "Турниры",
  "home.account": "Аккаунт",
  "home.settings": "Настройки",
  "home.signOut": "Выйти",
  "home.reference": "Справка",
  "home.scorekeeper": "Счёт",
  "home.historyOfBooksAndRuns": "История Books & Runs",

  "home.signInToSave": "Войди, чтобы сохранить прогресс",
  "home.signInToSaveBody": "Отслеживай статистику, достижения и игры на всех устройствах.",

  "home.waitingToStart": "Ожидание начала",
  "home.yourTurn": "Твой ход",
  "home.waitingForName": "Ожидание игрока {name}",
  "home.multiplayerGame": "Сетевая игра",
  "home.noMovesInDays": "{days} дн. без ходов",
  "home.daysAbbr": "{days} дн.",
  "home.turnEndsIn": "ход закончится через {time}",
  "home.turnOverdue": "просрочен",

  "home.yourGames": "Твои игры",
  "home.respondError": "Не удалось ответить — проверь подключение.",
  "home.invitedYou": "Приглашение от {name}",
  "home.someone": "Кто-то",
  "home.fullGame": "Полная игра на 7 раундов",
  "home.roundGame.one": "Игра на {count} раунд",
  "home.roundGame.few": "Игра на {count} раунда",
  "home.roundGame.many": "Игра на {count} раундов",
  "home.roundGame.other": "Игра на {count} раунда",
  "home.checkingForSave": "Проверяем наличие сохранённой игры…",
  "home.resumeGame": "Продолжить игру",

  "newGame.you": "Ты",
  "newGame.nPlayers.one": "{count} игрок",
  "newGame.nPlayers.few": "{count} игрока",
  "newGame.nPlayers.many": "{count} игроков",
  "newGame.nPlayers.other": "{count} игрока",
  "newGame.aiSuffix": "{grouped} ИИ",
  "newGame.allRounds": "Все 7 раундов",
  "newGame.shortGame": "Короткая игра",
  "newGame.nRounds.one": "{count} раунд",
  "newGame.nRounds.few": "{count} раунда",
  "newGame.nRounds.many": "{count} раундов",
  "newGame.nRounds.other": "{count} раунда",

  "newGame.title": "Новая игра",
  "newGame.tip.title": "Выбери темп",
  "newGame.tip.body":
    "Соло и «передай и играй» — это одна партия на этом устройстве: против ИИ или передавая устройство по кругу за столом. Игра с друзьями идёт медленнее: каждый играет в своё время, быть в сети одновременно не нужно. После первой сыгранной игры здесь появится удобный ярлык «Быстрый расклад» в один тап.",
  "newGame.startWithTutorial": "Новичок? Начни с обучения",
  "newGame.tutorialBlurb":
    "Короткий раунд с подсказками (ты против одного ИИ уровня «Новичок»), который проведёт тебя через взятие карт, сборку комбинаций и сброс — займёт около минуты и не учитывается в статистике.",
  "newGame.starting": "Запуск…",
  "newGame.startTutorial": "Начать обучение",
  "newGame.quickDeal": "Быстрый расклад",
  "newGame.dealIt": "Раздать",
  "newGame.soloAndPassAndPlay": "Соло и «передай и играй»",
  "newGame.soloAndPassAndPlayBody":
    "Играй прямо сейчас — против ИИ или передавая устройство по кругу за столом. Одна партия, на этом устройстве.",
  "newGame.withFriends": "С друзьями",
  "newGame.withFriendsBody":
    "Пошаговая игра онлайн. Каждый играет со своего устройства в своё время — ты делаешь ход, затем очередь переходит следующему.",
  "newGame.withFriendsSignedOut": "Пошаговые сетевые игры с друзьями.",
  "newGame.toPlayThese": "чтобы сыграть в них.",
  "newGame.takeTheTutorial": "Новичок? Пройди обучение →",
  "newGame.tutorialBlurbShort":
    "Обучение — это короткий раунд с подсказками (ты против одного ИИ уровня «Новичок»), который проведёт тебя через взятие карт, сборку комбинаций и сброс. Не учитывается в статистике.",

  "newGameLocal.meetTheAI": "Знакомство с ИИ-соперниками",
  "newGameLocal.lv": "Ур.{level}",
  "newGameLocal.tip.title": "Настройка игры",
  "newGameLocal.tip.body":
    "Добавь игроков-людей для режима «передай и играй» — все делят одно устройство, передавая его по очереди, — или заполни места ИИ-соперниками нужной сложности. «Все 7» — это полная игра; «Короткая» и «Своя» позволяют сыграть меньше раундов.",
  "newGameLocal.play": "Играть",
  "newGameLocal.forgetSetup": "Забыть эту настройку",
  "newGameLocal.humanPlayers": "Игроки-люди (передай и играй)",
  "newGameLocal.fewerPlayers": "Меньше игроков-людей",
  "newGameLocal.morePlayers": "Больше игроков-людей",
  "newGameLocal.changeInAccount": "Изменить в аккаунте",
  "newGameLocal.playerPlaceholder": "Игрок {n}",
  "newGameLocal.namesNoteLocked":
    "Остальные игроки здесь — только для этой игры, их имена не изменят твой аккаунт.",
  "newGameLocal.namesNoteUnlocked": "Только для этой игры — эти имена не изменят твой аккаунт.",
  "newGameLocal.theFirstPlayer": "первого игрока",
  "newGameLocal.statsNote.one":
    "На статистику, достижения и место в таблице лидеров в этой игре влияет только {name} — второй игрок за столом не входил в свой аккаунт, так что его результаты в любом случае никуда не записываются.",
  "newGameLocal.statsNote.few":
    "На статистику, достижения и место в таблице лидеров в этой игре влияет только {name} — остальные игроки за столом не входили в свои аккаунты, так что их результаты в любом случае никуда не записываются.",
  "newGameLocal.statsNote.many":
    "На статистику, достижения и место в таблице лидеров в этой игре влияет только {name} — остальные игроки за столом не входили в свои аккаунты, так что их результаты в любом случае никуда не записываются.",
  "newGameLocal.statsNote.other":
    "На статистику, достижения и место в таблице лидеров в этой игре влияет только {name} — остальные игроки за столом не входили в свои аккаунты, так что их результаты в любом случае никуда не записываются.",
  "newGameLocal.trackStats": "Учитывать статистику для этой игры",
  "newGameLocal.trackStatsNote":
    "За большим столом {name} не всегда один и тот же человек от игры к игре — отключи это, если результаты этой игры не должны учитываться в статистике.",
  "newGameLocal.aiOpponents": "ИИ-соперники",
  "newGameLocal.addAI": "+ Добавить ИИ",
  "newGameLocal.aiN": "ИИ {n}",
  "newGameLocal.removeAiN": "Удалить ИИ {n}",
  "newGameLocal.noAiOpponents": "Нет ИИ-соперников — только игроки-люди.",
  "newGameLocal.rounds": "Раунды",
  "newGameLocal.all7": "Все 7",
  "newGameLocal.short": "Короткая",
  "newGameLocal.custom": "Своя",
  "newGameLocal.shortNote": "Убирает два самых сложных смешанных раунда — {first} и {second}.",
  "newGameLocal.roundLabel": "Раунд {round}: {label}",
  "newGameLocal.pickAtLeastOneRound": "Выбери хотя бы один раунд.",
  "newGameLocal.pickOneRoundToStart": "Выбери хотя бы один раунд, чтобы начать.",
  "newGameLocal.needPlayers": "Нужно от 2 до {max} игроков всего, чтобы начать.",
  "newGameLocal.startGame": "Начать игру",
  "newGameLocal.savedCheck": "Сохранено ✓",
  "newGameLocal.updateQuickDeal": "Обновить «Быстрый расклад» под эту настройку",
  "newGameLocal.saveAsQuickDeal": "Сохранить как «Быстрый расклад»",

  "newGameMultiplayer.createError": "Не удалось создать игру — попробуй ещё раз.",
  "newGameMultiplayer.signInToPlay": "Войди, чтобы играть с друзьями",
  "newGameMultiplayer.backToNewGame": "← Новая игра",
  "newGameMultiplayer.title": "Новая сетевая игра",
  "newGameMultiplayer.tip.title": "Как это работает",
  "newGameMultiplayer.tip.body":
    "Выбери друзей, которых хочешь пригласить, и добавь ИИ, чтобы заполнить пустые места. Все приглашённые должны принять приглашение до раздачи карт — как только игра начнётся, делай ход, когда тебе удобно, а затем очередь переходит следующему игроку.",
  "newGameMultiplayer.inviteFriends": "Пригласить друзей",
  "newGameMultiplayer.noFriendsYet": "У тебя пока нет друзей. Добавь их на странице",
  "newGameMultiplayer.pageThenComeBack": "и возвращайся.",
  "newGameMultiplayer.aiOptional": "Необязательно — по умолчанию только настоящие игроки.",
  "newGameMultiplayer.shortNote": "Убирает два самых сложных смешанных раунда. Более быстрая игра — хороший вариант для первой сетевой партии.",
  "newGameMultiplayer.creating": "Создание…",
  "newGameMultiplayer.sendInvites": "Отправить приглашения",

  "common.or": "или",

  "howToPlay.title": "Как играть",
  "howToPlay.backToGame": "Назад к игре",
  "howToPlay.note": "Примечание:",
  "howToPlay.tutorial": "обучение",
  "howToPlay.confirmMeld": "Подтвердить комбинацию",
  "howToPlay.newHerePrefix": "Новичок? Нажми",
  "howToPlay.newHereBody": "— здесь есть",
  "howToPlay.newHereSuffix":
    "которое шаг за шагом проведёт тебя через настоящий раунд, с подсказками, указывающими точно, на что нажимать.",

  "howToPlay.basicSetup.title": "Базовая настройка",
  "howToPlay.basicSetup.players":
    "2–8 игроков (режим «передай и играй» на одном устройстве, плюс любое количество ИИ-соперников) — настрой их, укажи имена игроков-людей и выбери сложность каждого ИИ на экране «Новая игра».",
  "howToPlay.basicSetup.deck": "Одна стандартная колода из 52 карт на каждые 2 игроков, плюс джокеры — всё перемешивается вместе.",
  "howToPlay.basicSetup.deal": "Каждому игроку раздаётся по 13 карт.",
  "howToPlay.basicSetup.piles": "Остаток колоды образует колоду для взятия карт; верхняя карта открывает стопку сброса.",

  "howToPlay.rounds.title": "Раунды в игре",
  "howToPlay.rounds.body":
    "У каждого раунда свой обязательный контракт. Нужно полностью выполнить контракт этого раунда — весь сразу, — прежде чем можно будет подкладывать карты к любой комбинации. Стандартная игра — это все 7 раундов ниже, по порядку.",
  "howToPlay.rounds.round": "Раунд",
  "howToPlay.rounds.contract": "Контракт",
  "howToPlay.rounds.meldsNeeded": "Нужные комбинации",
  "howToPlay.rounds.bookRunDef": "Сет — это 3 и более карты одного достоинства; стрит — 4 и более карты одной масти по порядку.",
  "howToPlay.rounds.noteBody1": "На экране «Новая игра» можно изменить, какие раунды будут сыграны.",
  "howToPlay.rounds.noteBody2":
    "убирает раунды 4 и 5 (два самых сложных смешанных контракта) и играет остальные по порядку.",
  "howToPlay.rounds.noteBody3":
    "позволяет выбрать любое подмножество из 7 раундов выше — они всегда играются в исходном порядке 1–7, независимо от того, какие выбраны. Везде на этой странице, где написано «Раунд 7» или «после всех 7 раундов», подразумевается фактический последний раунд твоей игры, если ты играешь «Короткую» или «Свою».",

  "howToPlay.turn.title": "Как проходит ход",
  "howToPlay.turn.drawLabel": "Взятие",
  "howToPlay.turn.drawBody": "возьми одну карту из колоды или с верха стопки сброса.",
  "howToPlay.turn.meldLabel": "Комбинация",
  "howToPlay.turn.meldBody":
    "выкладывать карты можно только тогда, когда получается собрать весь контракт раунда сразу. Частичные комбинации не допускаются. Ты сам решаешь, какие из своих карт войдут в каждый сет или стрит — подробнее ниже.",
  "howToPlay.turn.layOffLabel": "Подкладка",
  "howToPlay.turn.layOffBody":
    "как только контракт выложен, можно добавлять лишние карты к любой уже выложенной комбинации — своей или чужой. Стрит остаётся отсортированным по мере добавления карт, а дикая карта всегда показывает маленький значок «как X» — достоинство, которое она заменяет. Если дикая карта может продолжить стрит с любого конца, тебя спросят, каким достоинством она должна быть. Маленький значок ↓ отмечает любую карту в руке или в сбросе, которая подходит к уже выложенной на столе комбинации, — он показывается даже до того, как ты выложишь свой контракт, чтобы ты мог заранее решить, какие карты придержать. Отключи это в настройках, если хочешь разбираться сам.",
  "howToPlay.turn.discardLabel": "Сброс",
  "howToPlay.turn.discardBody":
    "заверши ход, сбросив одну карту. Если комбинация и/или подкладка забрали все карты из руки, сбрасывать нечего — см. «Выход» ниже.",
  "howToPlay.turn.goingOutLabel": "Выход",
  "howToPlay.turn.goingOutBody":
    "раунд заканчивается в момент, когда у игрока, выложившего весь свой контракт, не остаётся карт на руке — будь то сразу при выкладке, после подкладки дополнительных карт или после последующего сброса. Если рука уже пуста, сбрасывать не нужно. Все остальные получают штрафные очки за карты, оставшиеся на руках.",

  "howToPlay.choosingMeld.title": "Выбор карт для комбинации",
  "howToPlay.choosingMeld.intro": "Когда готов собрать комбинацию, ты составляешь её сам — игра не делает это за тебя:",
  "howToPlay.choosingMeld.step1": "Нажимай на карты в руке, чтобы выбрать те, что пойдут в один сет или стрит.",
  "howToPlay.choosingMeld.step2Prefix": "Нажми",
  "howToPlay.choosingMeld.step2Suffix":
    "— если карты образуют действительный сет или стрит, они откладываются и убираются из видимой руки.",
  "howToPlay.choosingMeld.step3": "Повтори для каждого сета/стрита, который требует контракт раунда.",
  "howToPlay.choosingMeld.step4Prefix": "Когда отложенные группы точно совпадают с контрактом, нажми",
  "howToPlay.choosingMeld.step4Suffix": "чтобы выложить их все сразу.",
  "howToPlay.choosingMeld.outro":
    "Отложенную группу можно убрать обратно до подтверждения, если передумал. Если выбор — не действительный сет или стрит, будет показано, почему (см. правила ниже).",

  "howToPlay.rules.title": "Сеты и стриты — правила",
  "howToPlay.rules.bookLabel": "Сет:",
  "howToPlay.rules.bookBody": "3 и более карты одного достоинства, разных мастей.",
  "howToPlay.rules.runLabel": "Стрит:",
  "howToPlay.rules.runBody": "4 и более карты одной масти подряд по достоинству.",
  "howToPlay.rules.aceLabel": "Туз может быть младшим или старшим",
  "howToPlay.rules.aceBody":
    "стрит может идти Т-2-3-4 или В-Д-К-Т, но никогда не оба варианта сразу. Стрит не может закольцовываться, например Д-К-Т-2 — туз может стоять только на одном конце стрита, а не соединять короля и двойку в одной последовательности.",
  "howToPlay.rules.wildLabel": "Дикие карты:",
  "howToPlay.rules.wildBody":
    "Джокеры всегда дикие. Двойки универсальны — двойка может заменить любую недостающую карту в сете или стрите, либо сыграть как обычная карта своего достоинства (сет из двоек или настоящая «двойка» в стрите вроде Т-2-3-4) — смотря что нужно. Игра сама определяет, что ты имеешь в виду, исходя из остальных выбранных карт.",
  "howToPlay.rules.wildLimitLabel": "Лимит диких карт:",
  "howToPlay.rules.wildLimitBody":
    "в комбинации никогда не может быть больше диких карт, чем обычных. В сете из 3 карт может быть максимум 1 дикая; в стрите из 4 карт — максимум 2.",
  "howToPlay.rules.noTwoWildsLabel": "Не более одной дикой карты подряд:",
  "howToPlay.rules.noTwoWildsBody":
    "в стрите дикие карты не могут занимать два места подряд — например, 6-7-дикая-дикая недопустимо, а 6-7-8-дикая или дикая-6-7-дикая — можно.",

  "howToPlay.outNoDiscard.title": "Выход без сброса",
  "howToPlay.outNoDiscard.body1Prefix":
    "Если сборка контракта и/или подкладка карт уже забрали всю твою руку, ты выходишь из раунда сразу — сбрасывать больше нечего, поэтому сброс не требуется. Это может произойти в",
  "howToPlay.outNoDiscard.anyRound": "любом раунде",
  "howToPlay.outNoDiscard.body1Suffix": ", а не только в последнем.",
  "howToPlay.outNoDiscard.body2":
    "Вне последнего раунда одна лишь сборка контракта не завершает раунд, если после этого на руке остаются карты, — ты по-прежнему сбрасываешь карту как обычно, как в любой другой ход. Раунд заканчивается только тогда, когда рука действительно опустеет — будь то сразу при сборке контракта, после подкладки дополнительных карт или после сброса.",

  "howToPlay.threeRuns.title": "3 стрита: совсем без сброса",
  "howToPlay.threeRuns.body1Prefix": "Контракт",
  "howToPlay.threeRuns.threeRunsLabel": "3 стрита",
  "howToPlay.threeRuns.body1Suffix":
    "— раунд 7 в стандартной последовательности и всегда последний раунд, если он включён, — работает иначе, чем любой другой раунд: в комбинацию должна войти вся рука целиком, сразу. Для него нет ни этапа сброса, ни последующей подкладки лишних карт. Если стриту нужно быть длиннее обычного минимума в 4 карты, чтобы вместить всё, — это нормально: собирай его такой длины, какая нужна.",
  "howToPlay.threeRuns.body2":
    "На практике это значит, что собрать комбинацию в этом раунде можно только тогда, когда вся рука случайно делится ровно на 3 стрита. До этого момента продолжай брать и сбрасывать карты как обычно — этот раунд задуман как самый сложный для завершения, и обычно лишь один игрок успевает его собрать до конца игры.",
  "howToPlay.threeRuns.noteBody":
    "Это правило относится именно к контракту «3 стрита», а не просто к «какой бы раунд ни оказался последним». Если ты играешь «Свою» игру и не выбрал раунд 7, последний раунд твоей игры подчиняется обычному правилу выше — его сборка не требует всей руки целиком.",

  "howToPlay.scoring.title": "Подсчёт очков",
  "howToPlay.scoring.body":
    "Когда раунд заканчивается, каждый игрок, который не вышел, получает штрафные очки за карты, оставшиеся на руке. Побеждает тот, у кого после последнего раунда игры наименьшая общая сумма очков.",
  "howToPlay.scoring.card": "Карта",
  "howToPlay.scoring.penaltyPoints": "Штрафные очки",
  "howToPlay.scoring.numberCards": "Числовые карты (от 3 до 9)",
  "howToPlay.scoring.faceCards": "10, В, Д, К",
  "howToPlay.scoring.aces": "Тузы",
  "howToPlay.scoring.twos": "Двойки (дикие)",
  "howToPlay.scoring.jokers": "Джокеры (дикие)",
  "howToPlay.scoring.perCard": "по {points} очков",

  "howToPlay.organizing.title": "Организация руки",
  "howToPlay.organizing.body1": "Порядок карт в руке — только для твоего удобства, на игру это не влияет. Используй",
  "howToPlay.organizing.body2":
    "чтобы сгруппировать карты автоматически, или зажми и перетащи любую карту на новое место, чтобы расставить руку так, как удобно тебе.",
  "howToPlay.shortcuts.title": "Клавиатура и геймпад",
  "howToPlay.shortcuts.body":
    "Играть можно, не касаясь экрана: D — взять карту, стрелки — перемещение между картами, Enter — выбрать, Delete — сбросить, ? — список всех горячих клавиш. Работает и геймпад: крестовина — перемещение, A — выбор, B — назад.",

  "howToPlay.settings.body1":
    "В настройках можно выбрать цветовую тему приложения и стола, выбрать рубашку карт независимо от темы, задать сложность ИИ по умолчанию для новых ИИ-соперников, которых ты добавляешь на экране «Новая игра», включить или выключить звуковые эффекты, включить или выключить значки возможных подкладок, переключить кнопку «Чей сейчас ход?» и включить цвета карт для дальтоников. Ничего из этого не меняет правила выше — это только внешний вид и необязательные подсказки.",
  "howToPlay.settings.body2":
    "Полоса фишек игроков вверху игрового поля показывает количество карт у каждого и чей сейчас ход; нажми на фишку игрока, чтобы увидеть его последний сброс и последнее взятие из сброса.",

  "howToPlay.different.title": "Чем это отличается от игры за настоящим столом",
  "howToPlay.different.intro": "Несколько домашних правил из игры настоящими картами не вошли в это приложение.",
  "howToPlay.different.buyLabel": "Покупка сброса",
  "howToPlay.different.buyBody":
    "любой игрок, кроме только что сбросившего или следующего по очереди, мог «купить» верхнюю карту сброса вне очереди: забрать её, плюс одну штрафную карту из колоды, — и при этом ход к нему не переходил. Это работает только если все тайно следят за своей рукой и могут вмешаться в нужный момент — трудно осуществить, когда все смотрят в один экран, а ИИ разыгрывает свои ходы автоматически, поэтому это правило не включено.",
  "howToPlay.different.playerLabel": "«Игрок!»",
  "howToPlay.different.playerBody":
    "игрок, заметивший в сбросе карту, подходящую к чужой уже выложенной комбинации, мог объявить это, переложить карту на комбинацию сам и сбросить одну из своих карт в награду. Та же проблема, что и с покупкой сброса, — нужна скрытая от других рука, поэтому этого правила тоже нет.",
  "howToPlay.different.jokerBookLabel": "Сет из джокеров",
  "howToPlay.different.jokerBookBody":
    "двойки могут собрать сет своего достоинства (см. «Дикие карты» выше), а джокеры — нет. Для сета нужны разные масти, а у каждого джокера в этой колоде одна и та же условная масть, поэтому несколько джокеров никогда не смогут выполнить это условие так, как это делают несколько двоек. При этом джокер по-прежнему может заменить недостающую карту в любом сете или стрите, как обычно.",

  "welcome.title": "Добро пожаловать в Books & Runs!",
  "welcome.subtitle": "Осталось настроить пару мелочей.",
  "welcome.language": "Язык",
  "welcome.notifications": "Уведомления",
  "welcome.push.body": "Получай уведомление, когда наступает твой ход в сетевой игре.",
  "welcome.push.enable": "Включить уведомления",
  "welcome.push.enabling": "Включение…",
  "welcome.push.enabled": "Уведомления включены.",
  "welcome.push.error": "Не удалось включить уведомления.",
  "welcome.done": "Готово",

  // friends.*
  "friends.errors.noSuchCode": "Такого кода нет ни у одного аккаунта.",
  "friends.errors.ownCode": "Это твой собственный код.",
  "friends.errors.alreadyFriends": "Ты уже дружишь с {name}.",
  "friends.errors.sendFailed": "Не удалось отправить запрос — попробуй ещё раз.",
  "friends.shareMessage": "Добавь меня в друзья в Books & Runs 🃏  Мой код: {code}\n{url}",
  "friends.shareCard.footer": "Добавь меня: {code}",
  "friends.notConfigured.title": "Друзья пока не настроены",
  "friends.notConfigured.body": "К этому приложению пока не подключён проект Supabase.",
  "friends.signInGate.title": "Войди, чтобы добавлять друзей",
  "friends.signInGate.body": "Друзья позволяют вместе начинать сетевые игры. Список друзей привязан к твоему аккаунту.",
  "friends.signInGate.linkTitle": "Войди, чтобы добавить этого друга",
  "friends.signInGate.linkBody": "Кто-то поделился с тобой ссылкой для добавления в друзья. Войди — и ты сразу вернёшься сюда, чтобы принять её.",
  "friends.tip.title": "Больше, чем просто список",
  "friends.tip.body":
    "Добавляй друзей, чтобы начинать с ними сетевые игры, — поделись своим кодом или вставь их. Нажми на имя друга, чтобы открыть его профиль: уровень, достижения, витрину трофеев и (как только вы сыграете несколько сетевых игр вместе) счёт личных встреч между вами.",
  "friends.loadError": "Не удалось загрузить список друзей — проверь подключение и попробуй ещё раз.",
  "friends.link.addPrompt.prefix": "Добавить",
  "friends.link.addPrompt.suffix": "в друзья?",
  "friends.link.addFriend": "Добавить в друзья",
  "friends.link.adding": "Добавление…",
  "friends.link.done.prefix": "Вы с",
  "friends.link.done.suffix": "теперь друзья.",
  "friends.link.already.prefix": "Ты уже дружишь с",
  "friends.link.already.suffix": ".",
  "friends.link.self": "В этой ссылке твой собственный код — поделись ею с другом вместо этого.",
  "friends.link.invalid": "Эта ссылка для добавления в друзья не сработала — возможно, код неверный.",
  "friends.yourCode.heading": "Твой код друга",
  "friends.yourCode.descriptionWithCard":
    "Кнопка «Поделиться» отправляет твою карточку профиля — ту же картинку, которой можно поделиться из профиля. Тот, кто её откроет, сможет добавить тебя в один тап; обычный код ниже по-прежнему работает, если ты просто диктуешь его вслух.",
  "friends.yourCode.description":
    "Обычный код подходит, чтобы продиктовать его вслух или ввести вручную; кнопка «Поделиться» отправляет ссылку, которая добавляет тебя в один тап.",
  "friends.yourCode.shared": "Отправлено ✓",
  "friends.yourCode.shareFailed": "Не удалось поделиться",
  "friends.yourCode.share": "Поделиться",
  "friends.yourCode.copied": "Скопировано",
  "friends.yourCode.copyCode": "Скопировать код",
  "friends.addFriend.heading": "Добавить друга",
  "friends.addFriend.sending": "Отправка…",
  "friends.addFriend.sendRequest": "Отправить запрос",
  "friends.addFriend.requestSent": "Запрос отправлен игроку {name}.",
  "friends.addFriend.alreadyRequestedYou": "От {name} уже был запрос в друзья — теперь вы друзья.",
  "friends.requests.heading": "Запросы ({count})",
  "friends.yourFriends.heading": "Твои друзья ({count})",
  "friends.yourFriends.empty": "Пока нет друзей. Отправь кому-нибудь свой код выше, чтобы начать.",
  "friends.outgoing.heading": "Отправлено, ждём ответа",

  // leaderboard.*
  "leaderboard.notSetUp.title": "Таблица лидеров пока не настроена",
  "leaderboard.notSetUp.body": "К этому приложению пока не подключён проект Supabase.",
  "leaderboard.signInGate.title": "Войди, чтобы увидеть таблицу лидеров",
  "leaderboard.signInGate.body": "Она видна только вошедшим в аккаунт — не всем подряд.",
  "leaderboard.tip.title": "Найди своих друзей",
  "leaderboard.tip.bodyBeforeAccount":
    "Все вошедшие в аккаунт игроки, отсортированные по выбранному ниже показателю, — или нажми переключатель «Друзья», чтобы сравнивать только с добавленными тобой людьми. Нажми на любое имя, чтобы открыть профиль. Задай своё имя на",
  "leaderboard.tip.bodyAfterAccount": "странице.",
  "leaderboard.seasonTip.body":
    "Игры сыграны и выиграны с начала {season} — обнуляется 1-го числа каждого месяца, так что гонка всегда начинается заново, даже если ты отстаёшь в общем зачёте.",
  "leaderboard.view.allTime": "За всё время",
  "leaderboard.view.thisMonth": "В этом месяце",
  "leaderboard.sortBy": "Сортировать по",
  "leaderboard.column.player": "Игрок",
  "leaderboard.column.level": "Уровень",
  "leaderboard.column.achievements": "Достижения",
  "leaderboard.column.totalXp": "Всего XP",
  "leaderboard.column.winRate": "Процент побед",
  "leaderboard.column.avgScore": "Средний счёт",
  "leaderboard.column.games": "Игры",
  "leaderboard.column.wins": "Победы",
  "leaderboard.column.worstScore": "Худший счёт",
  "leaderboard.column.dailyStreak": "Серия дней",
  "leaderboard.column.bestStreak": "Лучшая серия",
  "leaderboard.column.mpWins": "Побед по сети",
  "leaderboard.column.mpWinRate": "Процент побед по сети",
  "leaderboard.column.mpStreak": "Серия по сети",
  "leaderboard.scope.allPlayers": "Все игроки",
  "leaderboard.loadError": "Не удалось загрузить таблицу лидеров — проверь подключение и попробуй ещё раз.",
  "leaderboard.emptyAll": "Пока никто не завершил учитываемую игру или «Расклад дня» — сыграй, чтобы стать первым.",
  "leaderboard.emptyFriends": "Никто из твоих друзей ещё не завершил учитываемую игру или «Расклад дня».",
  "leaderboard.emptySeason": "В этом месяце пока никто не завершил учитываемую игру — сыграй, чтобы стать первым.",
  "leaderboard.addFriendAria": "Добавить {name} в друзья",
  "leaderboard.friendRequestSentAria": "Запрос в друзья отправлен игроку {name}",
  "leaderboard.addFriend": "Добавить в друзья",
  "leaderboard.requestSent": "Запрос отправлен",
  "leaderboard.notOnBoardYet": "Пока нет ни одной завершённой учитываемой игры или «Расклада дня» — сыграй, чтобы появиться здесь.",

  // achievementsPage.*
  "achievementsPage.notConfigured.title": "Достижения пока не настроены",
  "achievementsPage.notConfigured.body": "К этому приложению пока не подключён проект Supabase.",
  "achievementsPage.summary.unlocked": "{count} / {total} открыто",
  "achievementsPage.summary.familiesMastered": "{count} из {total} категорий освоено",
  "achievementsPage.guestPrompt": "Войди, чтобы отслеживать свой прогресс по этим достижениям.",
  "achievementsPage.tip.title": "Отслеживается автоматически",
  "achievementsPage.tip.body":
    "Прогресс обновляется по ходу игры — засчитываются соло-игры, «передай и играй» и сетевые игры, отдельно ничего делать не нужно. Загляни сюда через несколько игр, чтобы увидеть, что уже близко.",
  "achievementsPage.filter.all": "Все",
  "achievementsPage.filter.completed": "Завершённые",
  "achievementsPage.filter.notCompleted": "Незавершённые",
  "achievementsPage.filter.allTiers": "Все уровни",
  "achievementsPage.sort.label": "Сортировка",
  "achievementsPage.sort.default": "Порядок по умолчанию",
  "achievementsPage.sort.closest": "Ближе всего к завершению",
  "achievementsPage.emptyFiltered": "Нет достижений, подходящих под эти фильтры.",
  "achievementsPage.tierUnlocked": "Открыто",
  "achievementsPage.masteredTooltip": "Освоено — открыты все уровни",
  "achievementsPage.masteredBadge": "Освоено",
  "achievementsPage.tiersCount": "{count}/{total} уровней",
  "achievementsPage.allTiersUnlocked": "Открыты все {count} уровней",
  "achievementsPage.tierUnlockedLine": "{tier} открыт",
  "achievementsPage.tierProgressLine": "{tier} — {progress}",

  // history.*
  "history.title": "История Books & Runs",
  "history.names.title": "Игра со множеством имён",
  "history.names.originPrefix":
    "«Books and Runs» относится к семейству карточных игр «Контрактный Рамми» и, как считается, восходит к игре под названием",
  "history.names.originSuffix":
    ", придуманной Рут Армсон (Ruth Armson). Историк карточных игр Дэвид Парлетт (David Parlett) предполагает, что Контрактный Рамми появился в 1930-х как продолжение тогдашнего повального увлечения контрактным бриджем — отсюда и слово «контракт»: каждый раунд требует выложить определённую комбинацию карт сразу целиком, что перекликается с торговлей контрактом в бридже.",
  "history.names.termsIntro": "Термины",
  "history.names.bookLabel": "«Сет»",
  "history.names.bookParen": "(3 и более карты одного достоинства) и",
  "history.names.runLabel": "«Стрит»",
  "history.names.runParenAndBody":
    "(4 и более карты одной масти по порядку) происходят из отдельной ветви этого семейства под названием Ливерпульский Рамми — несмотря на название, обычно описываемой как американская игра, а вовсе не английская по происхождению.",
  "history.cousins.title": "Место среди родственных игр",
  "history.cousins.ginRummy":
    "Джин Рамми стоит особняком: два игрока, никакого меняющегося от раунда к раунду контракта — просто сеты и стриты, собираемые для минимизации «мёртвого веса» перед объявлением стука. Та же логика сборки комбинаций, но совершенно другая структура — если Джин Рамми это спринт, то Контрактный Рамми это целый сезон.",
  "history.cousins.classicOrder":
    "Наиболее часто упоминаемая версия классического Контрактного Рамми использует те же 7 контрактов, что и это приложение, — от 2 сетов до 3 стритов, — но обычно в другом порядке для раундов 4–6 (3 сета, затем 2 сета + 1 стрит, затем 1 сет + 2 стрита). Эта версия меняет порядок этих трёх раундов и добавляет правило, что в раунде 7 нужно использовать всю руку целиком в одной комбинации, без сброса.",
  "history.cousins.liverpoolRummy":
    "Ливерпульский Рамми настолько близок к Контрактному Рамми, что эти два названия часто используют как взаимозаменяемые; чаще всего упоминаемое различие между ними — бонусные очки за то, что при снятии колоды сверху оказывается карта нужного достоинства открытой стороной вверх. В этом приложении такого правила нет.",
  "history.cousins.rum500Canasta":
    "Ещё дальше — «500 Рамми» (Rummy 500), которая вовсе отказывается от меняющегося контракта: можно выкладывать что угодно в любом раунде, а вместо этого начисляются бонусные очки за каждую выложенную карту. Канаста разделяет ту же самую основу «собирай сеты, добавляй дикие карты», но использует собственный подсчёт очков и куда более крупные требования к комбинациям. Обе игры — узнаваемые родственники, но достаточно далёкие, чтобы большинство игроков не назвали их той же самой игрой.",
  "history.cousins.phase10":
    "«Phase 10» — это то, с чем большинство людей в первую очередь сравнивают эту игру, и сходство действительно есть: фиксированная последовательность обязательных комбинаций, по одной на раунд, которую нужно выполнить в точности, чтобы продвинуться дальше, пока все остальные наперегонки делают то же самое. При этом это вовсе не разновидность Рамми — Fundex/Mattel построили её вокруг собственной фирменной колоды цветных карт с числами, плюс карты Wild и Skip, а не стандартной колоды из 52 карт, а её десять фаз зафиксированы, а не перетасовываются каждый раз в новом порядке, как это позволяет настоящая колода.",
  "history.thisVersion.title": "Эта версия",
  "history.thisVersion.body":
    "Конкретные правила, по которым играет это приложение, — 7 раундов, начиная с 2 сетов и заканчивая 3 стритами, дикие двойки и джокеры, а также таблица штрафных очков — следуют домашней версии игры, а не какому-то единому официальному своду правил. У Контрактного Рамми никогда не было одного главенствующего свода правил; почти у каждой семьи, играющей в неё, есть свой вариант, и этот вариант — наш, встроенный в приложение для игры «передай и играй», где ИИ-соперники подменяют игроков, когда за столом их не хватает.",
  "history.credits.title": "Благодарности",
  "history.credits.thanksPrefix":
    "Домашние правила, на которых построено это приложение, взяты не из свода правил — они родились за годы настоящих игр за настоящим столом. Спасибо",
  "history.credits.thanksSuffix":
    "за то, что помогли разобраться, как эта семья на самом деле играет в неё, — по этим правилам теперь играет и это приложение.",
  "history.credits.builtByPrefix": "Это приложение и сайт созданы",

  // clubs.*
  "clubs.title": "Клубы",
  "clubs.notSetUp.title": "Клубы пока не настроены",
  "clubs.notSetUp.body": "К этому приложению пока не подключён проект Supabase.",
  "clubs.signInTitle": "Войди, чтобы пользоваться клубами",
  "clubs.signInBody": "Клуб — это постоянная группа, привязанная к твоему аккаунту.",
  "clubs.tip.title": "Постоянный стол",
  "clubs.tip.body":
    "Клуб — это постоянная компания друзей, твоя постоянная команда. У него своя таблица результатов, охватывающая только этот состав, отдельная от общей таблицы лидеров. Со страницы клуба в любой момент можно начать турнир среди его состава.",
  "clubs.namePlaceholder": "Название клуба",
  "clubs.create": "Создать",
  "clubs.creating": "Создание…",
  "clubs.createError": "Не удалось создать клуб — попробуй ещё раз.",
  "clubs.loadError": "Не удалось загрузить твои клубы — проверь подключение и попробуй ещё раз.",
  "clubs.empty": "Пока нет клубов — создай клуб выше, чтобы завести постоянную группу с друзьями.",
  "clubs.memberCount.one": "{count} участник",
  "clubs.memberCount.few": "{count} участника",
  "clubs.memberCount.many": "{count} участников",
  "clubs.memberCount.other": "{count} участника",
  "clubs.notFound.title": "Клуб не найден",
  "clubs.notFound.loadErrorBody": "Не удалось загрузить — проверь подключение и попробуй ещё раз.",
  "clubs.notFound.deletedBody": "Возможно, он был удалён, или ты не состоишь в нём.",
  "clubs.backToClubs": "← Клубы",
  "clubs.addMemberError": "Не удалось добавить — попробуй ещё раз.",
  "clubs.removeMemberError": "Не удалось удалить — попробуй ещё раз.",
  "clubs.renameError": "Не удалось переименовать — попробуй ещё раз.",
  "clubs.deleteError": "Не удалось удалить — попробуй ещё раз.",
  "clubs.confirmDelete.title": "Удалить «{name}»?",
  "clubs.confirmDelete.body":
    "Клуб, его таблица результатов и список участников будут удалены для всех. Это нельзя отменить.",
  "clubs.confirmDelete.confirm": "Удалить клуб",
  "clubs.rename": "Переименовать",
  "clubs.startTournament": "Начать турнир с этим клубом",
  "clubs.standingsHeading": "Турнирная таблица — результаты сетевых игр",
  "clubs.ownerBadge": "владелец",
  "clubs.record": "{won}П / {played}",
  "clubs.bestStreak": "лучшая серия: {count}",
  "clubs.membersHeading": "Участники",
  "clubs.leave": "Покинуть",
  "clubs.addFriendHeading": "Добавить друга",
  "clubs.noAddableFriendsPrefix": "Все твои друзья уже в этом клубе, либо у тебя пока нет друзей —",
  "clubs.addSome": "добавь кого-нибудь",
  "clubs.add": "Добавить",
  "clubs.deleteClub": "Удалить этот клуб",

  // account.*
  "account.title": "Аккаунт",
  "account.notConfigured.title": "Аккаунты пока не настроены",
  "account.notConfigured.body": "К этому приложению пока не подключён проект Supabase.",
  "account.signInGate.title": "Войди, чтобы управлять аккаунтом",
  "account.tip.title": "Вход и безопасность",
  "account.tip.bodyPrefix": "Это отдельно от твоего профиля — имя, аватар и описание находятся на странице",
  "account.tip.profileLink": "профиль",
  "account.tip.bodySuffix":
    "; здесь же — только email, пароль, двухфакторная аутентификация и способ экспортировать или удалить всё, что привязано к этому аккаунту.",
  "account.currentPasswordPlaceholder": "Текущий пароль",
  "account.email.heading": "Email",
  "account.email.signedInAs": "Вход выполнен: {email}.",
  "account.email.newEmailPlaceholder": "Новый email",
  "account.email.confirmPasswordPlaceholder": "Текущий пароль, чтобы подтвердить, что это ты",
  "account.email.checkToConfirm": "Проверь {email}, чтобы подтвердить изменение, — до этого оно не вступит в силу.",
  "account.email.yourNewEmailAddress": "твой новый email",
  "account.email.submit": "Изменить email",
  "account.password.heading": "Пароль",
  "account.password.newPasswordPlaceholder": "Новый пароль",
  "account.password.updated": "Пароль изменён.",
  "account.password.submit": "Изменить пароль",
  "account.mfa.heading": "Двухфакторная аутентификация",
  "account.mfa.checking": "Проверка…",
  "account.mfa.scanInstructions":
    "Отсканируй это приложением-аутентификатором (Google Authenticator, 1Password, Authy и т. д.) или введи код ниже вручную.",
  "account.mfa.qrAlt": "QR-код — отсканируй приложением-аутентификатором",
  "account.mfa.codePlaceholder": "123456",
  "account.mfa.turnOn": "Включить",
  "account.mfa.onDescription": "Включено — при входе также будет запрашиваться код из приложения-аутентификатора.",
  "account.mfa.removePrompt": "Введи пароль, чтобы отключить это.",
  "account.mfa.turningOff": "Отключение…",
  "account.mfa.turnOff": "Отключить",
  "account.mfa.turnOffButton": "Отключить двухфакторную аутентификацию",
  "account.mfa.offDescription": "Выключено. Добавь приложение-аутентификатор для второго кода при входе — в дополнение к паролю.",
  "account.mfa.setUpButton": "Настроить двухфакторную аутентификацию",
  "account.mfa.startError": "Не удалось начать настройку — попробуй ещё раз.",
  "account.data.heading": "Твои данные",
  "account.data.description":
    "Скачай всё, что привязано к этому аккаунту, — статистику, историю игр, достижения, друзей и результаты сетевых игр — в одном JSON-файле.",
  "account.data.preparing": "Подготовка файла для скачивания…",
  "account.data.downloadButton": "Скачать мои данные",
  "account.data.exportError": "Не удалось подготовить файл — попробуй ещё раз.",
  "safety.menu.aria":
    "Другие действия для {name}",
  "safety.menu.title":
    "Пожаловаться или заблокировать",
  "safety.menu.report":
    "Пожаловаться",
  "safety.menu.block":
    "Заблокировать",
  "safety.block.confirmTitle":
    "Заблокировать {name}?",
  "safety.block.confirmBody":
    "Вы перестанете быть друзьями и не будете видеть друг друга: никаких заявок в друзья, приглашений и строк в рейтинге в обе стороны. Человек не узнает об этом. Разблокировать можно в любой момент на странице аккаунта.",
  "safety.block.error":
    "Не удалось заблокировать — попробуй ещё раз.",
  "safety.block.done":
    "Ты заблокировал(а) {name}.",
  "safety.report.title":
    "Пожаловаться на {name}",
  "safety.report.intro":
    "Жалобы рассматривает разработчик. Игрок не узнает, кто пожаловался.",
  "safety.report.reasonLabel":
    "Причина",
  "safety.report.noteLabel":
    "Что-нибудь ещё? (необязательно)",
  "safety.report.submit":
    "Отправить жалобу",
  "safety.report.sending":
    "Отправка…",
  "safety.report.error":
    "Не удалось отправить жалобу — попробуй ещё раз.",
  "safety.report.sentTitle":
    "Спасибо за жалобу",
  "safety.report.sentBody":
    "Мы посмотрим. Если не хочешь больше видеть {name}, можно ещё и заблокировать.",
  "safety.report.alsoBlock":
    "Заблокировать {name} тоже",
  "safety.reason.offensive":
    "Оскорбительное имя, описание или фото",
  "safety.reason.harassment":
    "Травля или оскорбления",
  "safety.reason.impersonation":
    "Выдаёт себя за другого",
  "safety.reason.cheating":
    "Читерство",
  "safety.reason.spam":
    "Спам или реклама",
  "safety.reason.inappropriate_photo":
    "Неприемлемое фото профиля",
  "safety.reason.other":
    "Другое",
  "safety.content.name":
    "Такое имя здесь недопустимо — выбери другое.",
  "safety.content.bio":
    "В описании есть недопустимые слова — перефразируй.",
  "safety.content.link":
    "Ссылки и адреса почты здесь запрещены.",
  "safety.content.reserved":
    "Это имя зарезервировано — выбери другое.",
  "safety.content.empty":
    "Введи имя.",
  "safety.blocked.heading":
    "Заблокированные игроки",
  "safety.blocked.empty":
    "Ты никого не блокировал(а).",
  "safety.blocked.description":
    "Заблокированные игроки не могут отправлять тебе заявки в друзья и приглашения, и вы не видите друг друга в рейтингах.",
  "safety.blocked.unblock":
    "Разблокировать",
  "safety.err.connect":
    "Связаться с этим игроком нельзя.",
  "safety.err.tooMany":
    "Слишком много попыток — попробуй позже.",
  "err.mp.alreadyNudged":
    "Недавно уже напоминали.",
  "err.mp.nothingToNudge":
    "Сейчас некому напоминать.",
  "account.delete.description":
    "Навсегда удалить аккаунт и все связанные с ним данные.",
  "account.delete.item.data":
    "Профиль, фото, статистика, история, достижения, настройки, друзья и строка в рейтинге будут удалены.",
  "account.delete.item.games":
    "Текущие игры будут засчитаны как сдача. Завершённые игры останутся у других игроков, а твоё имя заменится на «Удалённый игрок».",
  "account.delete.item.clubs":
    "Клубы и турниры, которыми ты владеешь, тоже удаляются.",
  "account.delete.item.irreversible":
    "Это нельзя отменить.",
  "account.delete.button":
    "Удалить мой аккаунт…",
  "account.delete.typePrompt":
    "Введи {word} для подтверждения",
  "account.delete.confirmWord":
    "УДАЛИТЬ",
  "account.delete.continue":
    "Продолжить",
  "account.delete.fallbackPrefix":
    "Не можешь войти или хочешь написать нам?",
  "account.delete.fallbackLink":
    "Свяжись с нами",
  "account.delete.confirmTitle":
    "Удалить аккаунт?",
  "account.delete.confirmBody":
    "Всё, что связано с аккаунтом, будет удалено навсегда. Отменить нельзя.",
  "account.delete.confirmButton":
    "Удалить навсегда",
  "account.delete.done":
    "Аккаунт удалён.",
  "account.delete.error":
    "Не удалось удалить аккаунт — попробуй чуть позже.",
  "account.delete.errLeave":
    "Не удалось выйти из игр — попробуй чуть позже.",
  "support.privacyRequest":
    "Запрос по конфиденциальности или аккаунту",
  "support.subjectPlaceholderPrivacy":
    "например: Удалите мой аккаунт",
  "support.descriptionPlaceholderPrivacy":
    "Расскажи, что нужно. Мы ответим на указанную ниже почту и можем попросить подтвердить личность.",
  "newGameMultiplayer.turnLimit.heading":
    "Лимит времени на ход",
  "newGameMultiplayer.turnLimit.off":
    "Без лимита",
  "newGameMultiplayer.turnLimit.hours":
    "{hours} ч",
  "newGameMultiplayer.turnLimit.note":
    "На каждый ход даётся {hours} ч. Если время вышло, за игрока делается безопасный ход; второй пропуск подряд — сдача.",
  "newGameMultiplayer.turnLimit.offNote":
    "Без таймера: игра ждёт сколько нужно. Зависшую игру всё равно можно покинуть кнопкой «Выйти».",
  "turnTimer.expired":
    "Время вышло",
  "turnTimer.yourEnds":
    "Твой ход закончится через {time}",
  "turnTimer.theirEnds":
    "Ход закончится через {time}",
  "turnTimer.lastChance":
    "Ты пропустил(а) прошлый ход — пропустишь этот и сдашься.",
  "turnTimer.unit.minutes":
    "{n} мин",
  "turnTimer.unit.hours":
    "{n} ч",
  "turnTimer.unit.days":
    "{n} д",
  "settings.notify.heading":
    "Какие уведомления",
  "settings.notify.turns":
    "Твой ход",
  "settings.notify.turnsHint":
    "Твой ход или время на исходе.",
  "settings.notify.invites":
    "Приглашения и заявки в друзья",
  "settings.notify.invitesHint":
    "Приглашения в игры и новые заявки в друзья.",
  "settings.notify.nudges":
    "Напоминания",
  "settings.notify.nudgesHint":
    "Когда тебе напоминают о ходе в игре.",
  "settings.notify.streaks":
    "Напоминания о серии",
  "settings.notify.streaksHint":
    "Когда серия в «Раскладе дня» или «Испытании недели» вот-вот прервётся.",
  "settings.notify.quietHours":
    "Тихие часы",
  "settings.notify.quietHoursHint":
    "В это время (по местному времени) push-уведомления не приходят. Входящие продолжают обновляться.",
  "settings.notify.from":
    "С",
  "settings.notify.to":
    "до",
  "leaderboard.loadMore":
    "Показать ещё",
  "leaderboard.yourRank":
    "Ты на {rank}-м месте из {total}",
  "account.delete.heading": "Удалить аккаунт",
  "account.error.notConfigured": "Не настроено.",
  "account.error.wrongPassword": "Неверный текущий пароль.",
  "account.error.needsFreshSignIn":
    "Для этого действия нужен свежий вход с кодом аутентификатора — выйди и войди снова, затем попробуй ещё раз.",
  "achievement.progress.climbing":
    "{value} / {threshold} {unit}",
  "achievement.progress.lowerIsBetter":
    "Лучший результат: {value} (цель: {threshold} или меньше {unit})",
  "terms.title":
    "Условия использования",
  "terms.lastUpdated":
    "Обновлено 25 сентября 2026 г.",
  "terms.intro":
    "Пользуясь Books & Runs («приложением»), вы соглашаетесь с этими условиями. Если вы с ними не согласны, пожалуйста, не пользуйтесь приложением.",
  "terms.app.title":
    "Приложение",
  "terms.app.bodyPrefix":
    "Books & Runs — карточная игра для игры по очереди на одном устройстве и одиночных партий против ИИ-соперников. Она полностью работает офлайн и без аккаунта. Создание аккаунта необязательно: он открывает статистику на всех устройствах, достижения и уровень аккаунта, а также социальные функции — Таблицу лидеров, друзей, клубы, турниры и пошаговые сетевые игры с другими игроками. О том, что это подразумевает, см. нашу",
  "terms.app.bodySuffix":
    ".",
  "terms.accounts.title":
    "Аккаунты",
  "terms.accounts.body":
    "Если вы создаёте аккаунт, вы отвечаете за сохранность своих учётных данных и за всё, что происходит под вашим аккаунтом. При регистрации указывайте достоверные сведения. Вы должны достичь возраста, необходимого для использования приложения согласно правилам о возрасте, изложенным в Политике конфиденциальности.",
  "terms.acceptableUse.title":
    "Допустимое использование",
  "terms.acceptableUse.body":
    "Не используйте приложение, чтобы мешать его нормальной работе, пытаться получить доступ к данным других пользователей, жульничать или вмешиваться в результаты игр, статистику или Таблицу лидеров, а также для каких-либо противоправных целей.",
  "terms.userContent.title":
    "Имена, фотографии и другой добавляемый вами контент",
  "terms.userContent.body":
    "Если вы задаёте отображаемое имя, описание профиля, название клуба или турнира либо фото профиля, их увидят другие игроки. Не используйте контент, который противоправен, разжигает ненависть, содержит травлю или сексуально откровенные материалы, выдаёт себя за другого человека либо которым вы не вправе делиться. Все права на ваш контент, которые у вас есть, остаются за вами; вы даёте нам разрешение хранить и показывать его внутри приложения, чтобы функции работали. Мы можем удалить или сбросить контент, нарушающий эти правила.",
  "terms.ip.title":
    "Интеллектуальная собственность",
  "terms.ip.body":
    "Дизайн, код и контент приложения принадлежат его разработчику. Правила карточной игры, лежащей в основе приложения, — распространённый вариант домашних правил и никому не принадлежат.",
  "terms.disclaimer.title":
    "Отказ от гарантий и ограничение ответственности",
  "terms.disclaimer.body":
    "Приложение предоставляется «как есть», без каких-либо гарантий. В максимальной степени, разрешённой законом, разработчик не несёт ответственности за любой ущерб, возникший из-за использования вами приложения.",
  "terms.disclaimer.statutory":
    "Ничто в этих условиях не ограничивает и не исключает ответственность за умысел или грубую неосторожность, за смерть или причинение вреда здоровью, а также любое право или любую ответственность, которые не могут быть ограничены или исключены в соответствии с императивными нормами законодательства о защите прав потребителей или иного законодательства страны, где вы проживаете.",
  "terms.service.title":
    "Изменения в приложении",
  "terms.service.body":
    "Приложение — хобби-проект, который ведёт разработчик-физическое лицо. Мы можем в любое время добавлять, изменять или удалять функции, сбрасывать или перебалансировать статистику и таблицы лидеров либо прекратить предоставление приложения или его частей (включая сетевые функции). Мы постараемся, где это возможно, разумно заранее уведомлять о существенных изменениях, но не можем гарантировать, что сетевые функции будут доступны всегда.",
  "terms.termination.title":
    "Прекращение использования",
  "terms.termination.body":
    "Вы можете в любой момент перестать пользоваться приложением или удалить аккаунт на странице аккаунта (подробнее — в Политике конфиденциальности). Разработчик может приостановить, ограничить или удалить аккаунт либо удалить контент, если они нарушают эти условия — например, читерство, травля, оскорбительные имена или фото, попытки атаковать или перегрузить сервис — и может сделать это без предупреждения, если нужно защитить сервис или других игроков. Игроки могут жаловаться друг на друга и блокировать друг друга; жалобы рассматривает разработчик. Если вы считаете решение ошибочным, свяжитесь с нами.",
  "terms.law.title":
    "Применимое право",
  "terms.law.body":
    "Ничто в этих условиях не лишает вас императивных прав, которые вы имеете по законодательству страны, где вы проживаете, и эти нормы продолжают действовать в отношении вас.",
  "terms.changes.title":
    "Изменения условий",
  "terms.changes.body":
    "Если эти условия изменятся, мы обновим дату в верхней части этой страницы. Если вы продолжите пользоваться приложением после изменения, это означает, что вы принимаете обновлённые условия; если вы их не принимаете, пожалуйста, прекратите пользоваться приложением и, если хотите, удалите аккаунт.",
  "terms.contact.body":
    "Вопросы по этим условиям? Пишите на",
  "privacy.lastUpdated":
    "Обновлено 25 сентября 2026 г.",
  "privacy.overview.title":
    "Обзор",
  "privacy.overview.body":
    "Books & Runs — карточная игра, в которую можно играть полностью офлайн, на одном устройстве и без аккаунта. Эта политика объясняет, что происходит, если вы решите создать аккаунт, и подтверждает, какие данные мы не собираем никогда.",
  "privacy.controller.title":
    "Кто отвечает за ваши данные",
  "privacy.controller.body":
    "Books & Runs ведёт разработчик-физическое лицо, который является оператором (контролёром) персональных данных, описанных в этой политике. За приложением не стоит никакая компания. Связаться с разработчиком можно по адресу электронной почты, указанному внизу этой страницы.",
  "privacy.localPlay.title":
    "Для локальной игры аккаунт не нужен",
  "privacy.localPlay.body":
    "Если вы ни разу не входите в аккаунт, ваши игры и настройки остаются при вас. Ваша текущая партия, настройки домашних правил и предпочтения хранятся только в локальном хранилище вашего браузера или устройства, никуда не передаются и нам не видны.",
  "privacy.localPlay.diagnostics":
    "Даже без аккаунта отправляются две небольшие категории данных, чтобы можно было находить и устранять неполадки: отчёты о сбоях и ошибках (текст ошибки, страница, на которой вы находились, тип вашего браузера и устройства и версия приложения) и анонимные счётчики использования, например «игра начата», с укрупнёнными сведениями, такими как режим игры и сложность. Счётчики использования не содержат идентификатора аккаунта, имени или устройства. Ваш IP-адрес неизбежно виден нашему хостинг-провайдеру при любом запросе, но мы не сохраняем его в этих записях. Если вы пользуетесь страницей поддержки, сообщение и любые файлы или контактный адрес, которые вы решите добавить, отправляются разработчику по электронной почте.",
  "privacy.localPlay.speed":
    "Чтобы приложение работало быстро, небольшая часть посещений также отправляет замер скорости страницы: за сколько она загрузилась и начала отвечать (округлённо), а также название страницы и тип соединения (например, «4g»). Как и счётчики использования, он не содержит ни аккаунта, ни имени, ни идентификатора устройства.",
  "privacy.account.title":
    "Если вы создаёте аккаунт",
  "privacy.account.intro":
    "Вход необязателен и открывает Статистику, Достижения, уровень аккаунта, Таблицу лидеров, Друзей, Клубы, Турниры и пошаговые сетевые игры. Если вы входите по электронной почте, мы храним:",
  "privacy.account.item.email":
    "Ваш адрес электронной почты и надёжно хешированный пароль — через нашего провайдера аутентификации (Supabase Auth), а также данные вашей двухфакторной аутентификации (приложение-аутентификатор), если вы её включите. Ваш сеанс входа хранится в локальном хранилище вашего браузера.",
  "privacy.account.item.stats":
    "Статистику игр, привязанную к аккаунту: сыгранные и выигранные игры, лучший, худший и средний счёт, а также победы с разбивкой по сложности ИИ-соперников.",
  "privacy.account.item.history":
    "Историю завершённых игр: соперников (ИИ или других игроков), счёт по раундам, победителя и время игры.",
  "privacy.account.item.achievements":
    "Прогресс достижений: количество определённых игровых действий — выложенных комбинаций, добавленных карт, раундов, выигранных определённым способом, и тому подобное, — по которым определяется, какие достижения вы открыли. Уровень аккаунта рассчитывается по этим данным и статистике выше и отдельно не хранится.",
  "privacy.account.item.displayName":
    "Отображаемое имя, если вы его задали. Оно необязательно, видно другим вошедшим игрокам в Таблице лидеров и вашим друзьям и не обязано быть настоящим именем. Пока имя не задано, вы отображаетесь под сгенерированным ярлыком вроде «Игрок 4821».",
  "privacy.account.item.profile":
    "Ваш публичный профиль, который любой вошедший игрок может просмотреть вместе с вашей записью в Таблице лидеров: необязательное краткое описание, аватар (эмодзи и цвет либо загруженная вами фотография), баннер, рамка, титул, значок, закреплённые достижения и стиль карт, уровень и статистика, серии Расклада дня и дата вашей регистрации. Загруженные фото профиля хранятся в публичном хранилище изображений, поэтому любой, у кого есть ссылка на фото, может его открыть. Не загружайте ничего, что вы не хотели бы показывать другим. Игроки могут пожаловаться на фото профиля, и мы храним такие жалобы (кто на кого пожаловался и, по желанию, причину).",
  "privacy.account.item.saves":
    "Ваш прогресс, чтобы вы могли продолжить на любом устройстве: текущая одиночная партия, сохранённая в вашем аккаунте, прохождения и результаты Расклада дня и Испытания недели, итоги месячных сезонов и ваша сохранённая любимая конфигурация игры.",
  "privacy.account.item.clubs":
    "Клубы и турниры, которые вы создаёте или к которым присоединяетесь: название клуба или турнира (видно его участникам), кто им владеет или проводит его, а также кто его участники.",
  "privacy.account.item.push":
    "Если вы включите уведомления — push-подписку вашего браузера (адрес и ключи шифрования от push-сервиса браузера), чтобы присылать уведомления «ваш ход», о приглашениях в игру, заявках в друзья, напоминаниях и серии, на выбранном вами языке. Вы выбираете, какие уведомления получать, и можете задать тихие часы; чтобы их соблюдать, мы храним эти настройки и смещение UTC вашего устройства. По умолчанию выключено, включается только по вашему согласию и отключается в любой момент в приложении или в настройках браузера или устройства.",
  "privacy.account.item.safety":
    "Данные о безопасности: игроки, которых вы блокируете (вы скрыты друг от друга), и жалобы, которые вы подаёте на других игроков (кто на кого, причина, необязательная короткая заметка, откуда подана, а также имя и описание игрока на тот момент). Жалобы видит только разработчик, они хранятся столько, сколько нужно для рассмотрения; пожаловавшийся остаётся неизвестным. Отображаемые имена, описания и названия клубов также автоматически проверяются по списку запрещённых слов и правилам против выдачи себя за другого.",
  "privacy.account.item.support":
    "Если вы отправляете чаевые через страницу «Поддержать разработчика», платёж полностью обрабатывает Stripe, и мы никогда не видим данные вашей карты. Мы храним только факт совершения платежа (идентификатор сессии Stripe, сумму и валюту), чтобы выдать вам значок поддержавшего.",
  "privacy.account.item.security":
    "Краткосрочные технические записи: уведомления в приложении и счётчики запросов, используемые для предотвращения злоупотреблений (хранятся не более нескольких недель), а для вошедших пользователей отчёты об ошибках могут быть связаны с вашим аккаунтом, чтобы мы могли разобраться в проблеме.",
  "privacy.account.item.friendsPrefix":
    "Индивидуальный для аккаунта",
  "privacy.account.item.friendCodeLabel":
    "код друга",
  "privacy.account.item.friendsSuffix":
    "и список друзей: какие аккаунты вы добавили в друзья и какие запросы в друзья, ещё не принятые, вы отправили или получили. Когда вы добавляете друга, ваше отображаемое имя становится видно ему, а его — вам.",
  "privacy.account.item.multiplayer":
    "Данные сетевых игр: для каждой пошаговой игры, которую вы начинаете или к которой присоединяетесь, — другие участники, рассадка, чей сейчас ход, количество карт на руках, счёт и итоговый результат. Полное состояние игры (включая перемешанную колоду и руку каждого игрока) хранится на стороне сервера и показывается игроку только как его собственный вид — руку другого игрока вы не увидите.",
  "privacy.account.item.aiDifficulty":
    "Ваши предпочтения, чтобы они следовали за вами на новое устройство или при переустановке: тема, рубашка и лицевая сторона карт, режим для дальтоников, размер текста, язык, настройки звука и вибрации, настройки фоновой музыки, параметры подсказок и подсветки, ваша сложность ИИ по умолчанию и выбранные домашние правила. Они синхронизируются с вашим аккаунтом, только пока вы вошли в него; если вы не входите в аккаунт, они остаются только на вашем устройстве и нам не отправляются.",
  "privacy.account.outro":
    "Мы не требуем вашего настоящего имени и не собираем данные о вашем местоположении, контактах или каких-либо разрешениях устройства, кроме уведомлений, если вы на них согласитесь. В приложении нет рекламы, а также сторонних аналитических и отслеживающих SDK.",
  "privacy.processors.title":
    "Кто обрабатывает эти данные",
  "privacy.processors.bodyPrefix":
    "Данные аккаунта хранятся в базе данных Postgres, размещённой у",
  "privacy.processors.linkText":
    "Supabase",
  "privacy.processors.bodySuffix":
    ", защищённой на уровне строк (row-level security), поэтому, кроме отображаемого имени и статистики, намеренно показываемых в Таблице лидеров, читать и изменять свои строки можете только вы. Ходы в пошаговых сетевых играх проверяет Edge Function Supabase, которая запускает тот же игровой движок; только она может видеть полное скрытое состояние игры.",
  "privacy.processors.others":
    "Другие поставщики услуг действуют только для целей, описанных здесь: Stripe обрабатывает необязательные чаевые, а служба доставки электронной почты используется для доставки сообщений, которые вы отправляете через страницу поддержки. Мы не продаём ваши персональные данные и не передаём их для рекламы.",
  "privacy.legalBases.title":
    "Зачем мы используем ваши данные (правовые основания)",
  "privacy.legalBases.body":
    "Мы используем данные вашего аккаунта, чтобы предоставлять услугу, о которой вы просили при создании аккаунта (исполнение нашего договора с вами на основании Условий использования). Там, где вы даёте согласие — например, на push-уведомления или на публичное фото профиля, — мы опираемся на ваше согласие, которое вы можете отозвать в любой момент. Отчёты об ошибках, анонимные счётчики использования и записи для предотвращения злоупотреблений мы используем в наших законных интересах — обеспечивать безопасность, честность и работоспособность приложения; вы можете возразить против этого (см. ниже). Там, где этого требует местное законодательство, мы также обрабатываем данные для исполнения юридических обязанностей. Это краткое изложение простым языком, а не заявление о сертификации по какому-либо конкретному закону.",
  "privacy.storage.title":
    "Cookie, локальное хранилище и уведомления",
  "privacy.storage.body":
    "Приложение не использует рекламные или аналитические cookie. Оно использует локальное хранилище вашего браузера и service worker (который кеширует страницы, чтобы приложение работало офлайн), чтобы запоминать вашу игру, предпочтения и, если вы вошли в аккаунт, ваш сеанс. Если вы согласитесь на push-уведомления, ваш браузер сохранит push-подписку. Вы можете в любой момент очистить эти данные или отключить уведомления в настройках браузера или устройства; очистка локального хранилища удалит на этом устройстве любую гостевую игру и предпочтения.",
  "privacy.export.title":
    "Экспорт и удаление данных",
  "privacy.export.bodyPrefix":
    "На странице аккаунта есть кнопка",
  "privacy.export.downloadLabel":
    "Скачать мои данные",
  "privacy.export.bodyMiddle":
    "— она в любой момент выдаёт данные, связанные с вашим аккаунтом (профиль, статистику, историю, достижения, настройки, сохранения, друзей, заблокированных игроков и результаты онлайн-игр), одним файлом и без запроса. Там же есть кнопка «Удалить мой аккаунт»: после подтверждения паролем ваш аккаунт и всё, что с ним связано — статистика, история игр, прогресс достижений, профиль и фото, друзья, ваши клубы и турниры, подписки на уведомления — удаляются сразу. Игры с другими людьми остаются у них, а ваше имя заменяется на «Удалённый игрок»; текущие игры засчитываются как сдача. Если воспользоваться кнопкой нельзя (например, потерян пароль), напишите на",
  "privacy.export.bodySuffix":
    "с адреса, указанного в аккаунте, и мы удалим его для вас. Удаление аккаунта также убирает вас из списков друзей других игроков.",
  "privacy.retention.title":
    "Как долго мы храним данные",
  "privacy.retention.body":
    "Мы храним данные вашего аккаунта, пока он существует. Когда вы удаляете аккаунт (в приложении или по запросу), данные удаляются сразу — а при запросе по почте — оперативно и в любом случае в разумный срок. Жалобы, которые вы подаёте на других игроков, хранятся столько, сколько нужно для их рассмотрения. Отчёты о сбоях автоматически удаляются примерно через 30 дней, а краткосрочные записи уведомлений и защиты от злоупотреблений — не позднее чем через несколько недель. Анонимные счётчики использования не содержат личных идентификаторов и хранятся до 13 месяцев. Копии могут некоторое время оставаться в резервных копиях провайдера, пока не будут перезаписаны.",
  "privacy.transfers.title":
    "Трансграничная передача данных",
  "privacy.transfers.body":
    "Наш хостинг-провайдер может хранить и обрабатывать данные на серверах за пределами страны, где вы проживаете. В таких случаях мы полагаемся на меры защиты, применяемые провайдером при трансграничной передаче данных. Пользуясь аккаунтом, вы понимаете, что ваши данные могут обрабатываться в других странах.",
  "privacy.rights.title":
    "Ваши права",
  "privacy.rights.body":
    "В зависимости от места жительства у вас могут быть права на доступ к персональным данным, их исправление, удаление, получение копии в переносимом формате, возражение против отдельных видов обработки или её ограничение и отзыв согласия. Многое можно сделать самостоятельно: изменить профиль и настройки в приложении, скачать данные и удалить аккаунт на странице аккаунта. По всем остальным вопросам пишите на адрес ниже. Вы также вправе подать жалобу в местный орган по защите данных. Перед выполнением запроса нам может понадобиться убедиться, что это вы.",
  "privacy.children.title":
    "Конфиденциальность детей",
  "privacy.children.body":
    "Приложение не предназначено для детей младше 13 лет, и мы сознательно не собираем их персональные данные. Там, где местное законодательство устанавливает более высокий минимальный возраст для дачи согласия на обработку собственных персональных данных (например, 14 лет в Южной Корее или 16 лет в некоторых странах Европейского союза), приложение не предназначено и для лиц младше этого возраста, и им не следует создавать аккаунт. Если вы считаете, что ребёнок передал нам персональные данные, свяжитесь с нами, и мы их удалим.",
  "privacy.changes.title":
    "Изменения этой политики",
  "privacy.changes.body":
    "Если эта политика изменится, мы обновим дату в верхней части этой страницы, а о существенных изменениях постараемся уведомить вошедших пользователей в приложении.",
  "privacy.contact.body":
    "Вопросы или хотите удалить свои данные? Пишите на",
  "scorecard.title":
    "Счётчик очков",
  "scorecard.tip.title":
    "Просто таблица очков",
  "scorecard.tip.body":
    "Для подсчёта очков в настоящей карточной игре за столом — только сложение, ничего лишнего.",
  "scorecard.players":
    "Игроки",
  "scorecard.addPlayer":
    "+ Добавить игрока",
  "scorecard.removePlayer":
    "Убрать: {name}",
  "scorecard.rounds":
    "Раунды",
  "scorecard.needTwoPlayers":
    "Чтобы начать, добавь как минимум 2 игроков.",
  "scorecard.start":
    "Начать подсчёт",
  "scorecard.roundAbbr":
    "Р{round}",
  "scorecard.lowestWinsNote":
    "Побеждает наименьшая сумма. Оставь ячейку пустой, если раунд ещё не подсчитан, — она считается за 0, пока ты её не заполнишь.",
  "scorecard.confirmReset":
    "Очистить эту таблицу? Все игроки и очки будут удалены — это нельзя отменить.",
  "scorecard.yesStartOver":
    "Да, начать заново",
  "scorecard.newScorecard":
    "Новая таблица",
  "resetPassword.title":
    "Установи новый пароль",
  "resetPassword.updated":
    "Пароль обновлён.",
  "resetPassword.newPasswordPlaceholder":
    "Новый пароль",
  "resetPassword.updateButton":
    "Обновить пароль",
  "resetPassword.linkInvalid":
    "Эта ссылка недействительна или устарела.",
  "resetPassword.requestNewOne":
    "Запросить новую",
  "support.title":
    "Связь и поддержка",
  "support.subheading":
    "Нашёл ошибку или есть идея? Расскажи нам о ней ниже.",
  "support.whatIsThisAbout":
    "О чём речь?",
  "support.bug":
    "Ошибка",
  "support.featureRequest":
    "Пожелание",
  "support.subject":
    "Тема",
  "support.subjectPlaceholderBug":
    "напр. Карты накладываются друг на друга на телефоне",
  "support.subjectPlaceholderFeature":
    "напр. Добавить тёмно-зелёную тему",
  "support.description":
    "Описание",
  "support.descriptionPlaceholderBug":
    "Что произошло и чего ты ожидал вместо этого? Шаги для воспроизведения очень помогут.",
  "support.descriptionPlaceholderFeature":
    "Что бы ты хотел увидеть и чем это поможет?",
  "support.yourEmail":
    "Твой email",
  "support.emailOptionalNote":
    "(необязательно — чтобы мы могли ответить)",
  "support.attachments":
    "Вложения",
  "support.attachmentsOptionalNote":
    "(необязательно — скриншоты помогают)",
  "support.removeFile":
    "Убрать: {name}",
  "support.maxAttachmentsReached":
    "Можно прикрепить не более {max} файлов.",
  "support.unsupportedFileType":
    "Тип файла {name} не поддерживается (изображения, PDF или текст).",
  "support.attachmentsTooLarge":
    "Общий размер вложений не должен превышать {max}.",
  "support.subjectAndDescriptionRequired":
    "Нужны и тема, и описание.",
  "support.sendFailedGeneric":
    "Отправить не получилось — проверь подключение и попробуй ещё раз.",
  "support.sending":
    "Отправка…",
  "support.send":
    "Отправить",
  "support.thanksHeading":
    "Спасибо — мы получили.",
  "support.replyIfProvided":
    "Если нам понадобятся подробности, мы ответим на указанный тобой адрес.",
  "support.replyIfNotProvided":
    "Если хочешь получить ответ, отправь ещё одно сообщение и на этот раз оставь адрес электронной почты.",
  "support.sendAnother":
    "Отправить ещё",
  "tip.intro.prefix":
    "Books & Runs бесплатна, без рекламы и сделана одним человеком (и семьёй, которая в неё действительно играет — см. её",
  "tip.intro.historyLink":
    "историю",
  "tip.intro.suffix":
    "). Чаевые совершенно необязательны и ничего не меняют в игре — никакой рекламы, никакого pay-to-win, ничего не закрыто за ними, кроме небольшого значка благодарности.",
  "tip.signInPromptSuffix":
    "сначала, чтобы чаевые можно было зачесть твоему аккаунту — только так значок ☕ Сторонник ниже узнает, кому его открыть.",
  "tip.tier.coffee.label":
    "Кофе",
  "tip.tier.coffee.blurb":
    "☕ Маленькое спасибо",
  "tip.tier.roundOfCards.label":
    "Раунд карт",
  "tip.tier.roundOfCards.blurb":
    "🃏 Ценится больше, чем ты думаешь",
  "tip.tier.fullTable.label":
    "Полный стол",
  "tip.tier.fullTable.blurb":
    "🎉 Очень серьёзная помощь",
  "tip.notConfigured":
    "Пока не настроено — добавь свои Stripe Payment Links в PAYMENT_LINKS в app/tip/page.tsx.",
  "tip.afterTip.prefix":
    "После того как чаевые пройдут, значок ☕ Сторонник появится в твоём",
  "tip.afterTip.profileLink":
    "профиле",
  "tip.afterTip.suffix":
    "в течение нескольких минут — надень его на вкладке «Значок» в разделе «Изменить профиль».",
  "tournaments.title":
    "Турниры",
  "tournaments.notSetUp.title":
    "Турниры ещё не настроены",
  "tournaments.notSetUp.body":
    "К этому приложению пока не подключён проект Supabase.",
  "tournaments.signInTitle":
    "Войди, чтобы участвовать в турнирах",
  "tournaments.signInBody":
    "Серия турнира привязана к твоему аккаунту, как и любая сетевая игра.",
  "tournaments.tip.title":
    "Круговая серия",
  "tournaments.tip.body":
    "Один и тот же состав играет фиксированное число партий подряд — без вылетов, никто не пропускает. Побеждает тот, у кого наименьшая сумма очков за всю серию.",
  "tournaments.startATournament":
    "Начать турнир",
  "tournaments.loadError":
    "Не удалось загрузить твои турниры — проверь подключение и попробуй ещё раз.",
  "tournaments.emptyState":
    "Турниров пока нет — начни один выше вместе с друзьями.",
  "tournaments.complete":
    "Завершён",
  "tournaments.status.pending":
    "Ожидание приглашений",
  "tournaments.status.active":
    "Идёт",
  "tournaments.status.complete":
    "Завершён",
  "tournaments.status.cancelled":
    "Отменён",
  "tournaments.notFound.title":
    "Турнир не найден",
  "tournaments.notFound.loadErrorBody":
    "Не удалось загрузить — проверь подключение и попробуй ещё раз.",
  "tournaments.notFound.body":
    "Возможно, он был удалён или ты не участник.",
  "tournaments.backToTournaments":
    "← Турниры",
  "tournaments.startNextRoundError":
    "Не удалось начать следующий раунд — попробуй ещё раз.",
  "tournaments.fromClub":
    " · из клуба {club}",
  "tournaments.wonTheSeries":
    "{name} выигрывает серию!",
  "tournaments.seriesComplete":
    "Серия завершена",
  "tournaments.startRoundOf":
    "Начать раунд {round} из {total}",
  "tournaments.standings":
    "Таблица результатов",
  "tournaments.gamesWon":
    "{count} поб.",
  "tournaments.rounds":
    "Раунды",
  "tournaments.roundN":
    "Раунд {round}",
  "tournaments.confirmCancel.title": "Отменить этот турнир?",
  "tournaments.confirmCancel.body":
    "Турнир завершится для всех. Уже сыгранные партии сохранят результаты, а несыгранные раунды не состоятся.",
  "tournaments.confirmCancel.confirm": "Отменить турнир",
  "tournaments.confirmCancel.keep": "Оставить",
  "tournaments.cancelError":
    "Не удалось отменить — попробуй ещё раз.",
  "tournaments.cancelTournament":
    "Отменить турнир",
  "tournaments.new.title":
    "Новый турнир",
  "tournaments.new.tip.body":
    "Один и тот же состав играет фиксированное число партий подряд — без вылетов, никто не пропускает. Побеждает тот, у кого наименьшая сумма очков за все партии. Раунд 1 рассылает приглашения, как и любая другая сетевая игра; когда он закончится, вернись сюда, чтобы начать следующий.",
  "tournaments.new.name":
    "Название",
  "tournaments.new.namePlaceholder":
    "напр. Пятничная лига",
  "tournaments.new.seriesLength":
    "Длина серии",
  "tournaments.new.nGames.one":
    "{count} партия",
  "tournaments.new.nGames.few":
    "{count} партии",
  "tournaments.new.nGames.many":
    "{count} партий",
  "tournaments.new.nGames.other":
    "{count} партии",
  "tournaments.new.roundsPerGame":
    "Раундов в партии",
  "tournaments.new.createError":
    "Не удалось создать турнир — попробуй ещё раз.",
  "tournaments.new.startButton":
    "Начать турнир — разослать приглашения",
  "aiPersona.pip":
    "Всё ещё учится отличать сет от стрита.",
  "aiPersona.nutmeg":
    "Играет осторожно и надеется на лучшее.",
  "aiPersona.barnaby":
    "Не торопится — порой слишком.",
  "aiPersona.dabble":
    "Берёт карты на всякий случай, а потом забывает, на какой.",
  "aiPersona.bumble":
    "Прыгает, не глядя, каждый ход.",
  "aiPersona.doodle":
    "Стрит всё ещё считает по пальцам.",
  "aiPersona.waffle":
    "Держит всё подряд и выкладывает почти ничего.",
  "aiPersona.clover":
    "Правила знает, над стратегией ещё работает.",
  "aiPersona.quill":
    "Осторожен, но уже начинает рисковать по-настоящему.",
  "aiPersona.hazel":
    "Быстро выкладывает комбинации, медленно планирует наперёд.",
  "aiPersona.skipper":
    "Есть план, и он его держится — пока тот не перестаёт работать.",
  "aiPersona.dax":
    "Строит неспешно. Никогда не идёт коротким путём, даже очевидным.",
  "aiPersona.newt":
    "Подстраивается под стол, но всегда примерно на ход позже.",
  "aiPersona.bram":
    "Сомневается в каждом взятии и оставляет не ту карту.",
  "aiPersona.hedda":
    "Читает сброс как книгу.",
  "aiPersona.reynard":
    "Вечно целится в следующее добавление к комбинации.",
  "aiPersona.talon":
    "Играет прямо, без лишних ходов.",
  "aiPersona.bandit":
    "Забирает ровно ту карту, к которой ты тянулся.",
  "aiPersona.cleaver":
    "Рано выбирает линию и доводит её до конца.",
  "aiPersona.slate":
    "Терпелив. Ждёт, пока ты переиграешь себя, и тогда идёт в атаку.",
  "aiPersona.echo":
    "Следит за каждым сбросом и играет на вероятностях, а не на надежде.",
  "aiPersona.corvina":
    "Редко сбрасывает что-то полезное.",
  "aiPersona.zara":
    "Быстра, остра и не слишком снисходительна.",
  "aiPersona.idris":
    "Считает карты лучше, чем тебе хотелось бы.",
  "aiPersona.marlow":
    "Чует слабую руку и закрывает раунд, пока ты не опомнился.",
  "aiPersona.kesler":
    "Шесть ходов сидит неподвижно. А потом всё кончено.",
  "aiPersona.sabre":
    "Всегда в одной удачной карте от выхода.",
  "aiPersona.vex":
    "Карты работают в трёх комбинациях ещё до того, как ты выложил хоть одну.",
  "aiPersona.vesper":
    "Каждый сброс — ловушка.",
  "aiPersona.magnus":
    "Играет на всю партию, а не только на раунд.",
  "aiPersona.nyra":
    "Беспощадно эффективна. Удачи.",
  "aiPersona.drake":
    "Играет так, будто раунд уже подсчитан. Обычно так и есть.",
  "aiPersona.bly":
    "Ты играешь этот раунд. Он играет все семь.",
  "aiPersona.rook":
    "Каждую сброшенную им карту ты пожалеешь, что взял.",
  "aiPersona.sett":
    "Закрывает одну комбинацию и хоронит все твои варианты.",
  "player.notConfigured.title":
    "Профили ещё не настроены",
  "player.notConfigured.body":
    "К этому приложению пока не подключён проект Supabase.",
  "player.signInGate.title":
    "Войди, чтобы увидеть этот профиль",
  "player.signInGate.body":
    "Профили видны только вошедшим аккаунтам — не широкой публике.",
  "player.noProfile.title":
    "Нет профиля для показа",
  "player.noProfile.body":
    "В этой ссылке не указано, чей профиль открыть.",
  "player.loadError":
    "Не удалось загрузить этот профиль — проверь подключение.",
  "player.tip.selfTitle":
    "Твой профиль",
  "player.tip.otherTitle":
    "Профили игроков",
  "player.tip.selfBody":
    "Верхняя часть — то, что другие игроки видят в Таблице лидеров и списке друзей; нажми «Изменить профиль», чтобы на вкладках сменить картинку, значок, рамку, титул, баннер, имя, описание или закрепить достижения в своей Витрине трофеев. Повышение уровня и освоение категорий достижений открывают эксклюзивные значки, рамки и титулы. Всё в разделе «Твоя активность» ниже видно только тебе.",
  "player.tip.otherBody":
    "Такая страница есть у каждого вошедшего игрока — нажми на имя где угодно (Таблица лидеров, Друзья), чтобы открыть её. Отсюда же можно добавить игрока в друзья.",
  "player.editProfile.done":
    "Закончить редактирование профиля",
  "player.editProfile.edit":
    "Изменить профиль",
  "player.friend.requestSent":
    "Запрос в друзья отправлен",
  "player.friend.add":
    "Добавить в друзья",
  "player.share.button":
    "Поделиться карточкой профиля",
  "player.badge.earned":
    "Заработанный значок",
  "player.creator.title":
    "Создатель Books & Runs",
  "player.creator.label":
    "Создатель",
  "player.joined":
    "Присоединился {date}",
  "player.report.button":
    "Пожаловаться",
  "player.share.shared":
    "Отправлено.",
  "player.share.error":
    "Не удалось подготовить изображение — попробуй ещё раз.",
  "player.report.prompt":
    "Что не так с этим фото? (необязательно)",
  "player.report.sending":
    "Отправка жалобы…",
  "player.report.submit":
    "Пожаловаться",
  "player.report.sent":
    "Спасибо — мы посмотрим.",
  "player.report.error":
    "Не удалось отправить жалобу — попробуй ещё раз.",
  "player.tab.picture":
    "Картинка",
  "player.tab.badge":
    "Значок",
  "player.tab.trophies":
    "Трофеи",
  "player.tab.frame":
    "Рамка",
  "player.tab.title":
    "Титул",
  "player.tab.banner":
    "Баннер",
  "player.tab.boutique":
    "Бутик",
  "player.tab.nameAndBio":
    "Имя и описание",
  "player.picture.heading":
    "Картинка профиля",
  "player.picture.emojiTab":
    "Эмодзи",
  "player.picture.photoTab":
    "Фото",
  "player.picture.useEmoji":
    "Использовать {emoji} как аватар",
  "player.picture.backgroundColor":
    "Цвет фона: {label}",
  "player.saveError":
    "Не удалось сохранить — попробуй ещё раз.",
  "player.photo.none":
    "Фото пока нет",
  "player.photo.formatHint":
    "JPEG, PNG или WebP. Автоматически обрезается до квадрата.",
  "player.photo.uploading":
    "Загрузка…",
  "player.photo.replace":
    "Заменить фото",
  "player.photo.upload":
    "Загрузить фото",
  "player.photo.useEmojiInstead":
    "Вместо этого использовать эмодзи-аватар",
  "player.photo.uploadError":
    "Не удалось загрузить фото — попробуй ещё раз.",
  "player.badge.description":
    "Небольшая заработанная накладка в углу аватара — показывается вместе с картинкой, а не вместо неё. Повышение уровня и освоение категорий достижений открывают новые.",
  "player.badge.none":
    "Без значка",
  "player.badge.useEmoji":
    "Использовать {emoji} как значок",
  "player.badge.lockedAriaLabel":
    "{emoji} закрыто — {requirement}",
  "player.trophies.heading":
    "Витрина трофеев",
  "player.trophies.description":
    "Выбери до {max} достижений, которые будут показаны вверху твоего профиля.",
  "player.trophies.loading":
    "Загрузка твоих достижений…",
  "player.trophies.empty":
    "Пока ничего не открыто — сыграй партию-другую, а потом возвращайся выбирать любимые.",
  "player.trophies.save":
    "Сохранить витрину трофеев",
  "player.frame.heading":
    "Рамка аватара",
  "player.frame.description":
    "Кольцо вокруг всего аватара, отдельное от картинки внутри — любой цвет доступен бесплатно. Исключение — «Гроссмейстер»: он даётся за освоение всех категорий достижений.",
  "player.title.description":
    "Показывается под твоим именем — зарабатывается так же, как и значок.",
  "player.banner.heading":
    "Баннер профиля",
  "player.banner.description":
    "Широкая цветная полоса за твоим именем и картинкой — большинство можно выбрать бесплатно; один — престижная награда за освоение всех категорий достижений.",
  "player.boutique.descriptionCreator":
    "Предварительный показ того, что со временем можно будет купить, — выбрано из тех же каталогов значков, рамок, титулов и баннеров, что и всё остальное, просто собрано в одном месте. Как создатель ты можешь видеть и использовать всё это; остальные видят это закрытым, пока оно не поступит в продажу.",
  "player.boutique.description":
    "Предварительный показ того, что со временем можно будет купить здесь, — выбрано из тех же каталогов значков, рамок, титулов и баннеров, что и всё остальное. Пока не продаётся.",
  "player.boutique.empty":
    "В Бутике пока ничего нет — загляни позже.",
  "player.boutique.badges":
    "Значки",
  "player.boutique.frames":
    "Рамки",
  "player.boutique.titles":
    "Титулы",
  "player.boutique.banners":
    "Баннеры",
  "player.nameEditor.heading":
    "Отображаемое имя",
  "player.nameEditor.description":
    "Показывается здесь и в Таблице лидеров — уникально среди всех игроков, поэтому может быть уже занято.",
  "player.nameEditor.placeholder":
    "Твоё имя",
  "player.nameEditor.checking":
    "Проверка…",
  "player.nameEditor.available":
    "Свободно.",
  "player.nameEditor.taken":
    "Уже занято.",
  "player.nameEditor.emptyError":
    "Введи имя — или оставь поле пустым и выбери позже, если пока не определился.",
  "player.bioEditor.heading":
    "Описание",
  "player.bioEditor.description":
    "Короткая строка, которую другие игроки видят в твоём профиле. Необязательно.",
  "player.bioEditor.placeholder":
    "Расскажи о себе…",
  "player.headToHead.heading":
    "Личные встречи",
  "player.headToHead.wins":
    "Победы",
  "player.headToHead.losses":
    "Поражения",
  "player.headToHead.ties":
    "Ничьи",
  "player.headToHead.games.one":
    "В {count} сетевой игре вместе",
  "player.headToHead.games.few":
    "В {count} сетевых играх вместе",
  "player.headToHead.games.many":
    "В {count} сетевых играх вместе",
  "player.headToHead.games.other":
    "В {count} сетевых играх вместе",
  "player.stats.achievements":
    "Достижения",
  "player.stats.totalXp":
    "Всего опыта",
  "player.stats.games":
    "Игры",
  "player.stats.winRate":
    "Доля побед",
  "player.stats.avgScore":
    "Ср. счёт",
  "player.stats.worstScore":
    "Худший счёт",
  "player.stats.dailyStreak":
    "Серия «Расклада дня»",
  "player.stats.bestStreak":
    "Лучшая серия",
  "player.stats.mpWins":
    "Сетевые победы",
  "player.stats.mpWinRate":
    "Доля сетевых побед",
  "player.stats.mpStreak":
    "Сетевая серия",
  "player.stats.gamesWon":
    "Выиграно игр",
  "player.stats.gamesTied":
    "Игр вничью",
  "player.stats.rareResult":
    "редкий результат",
  "player.stats.played":
    "Сыграно",
  "player.stats.winStreak":
    "Серия побед",
  "player.stats.bestStreakSub":
    "лучшая: {count}",
  "player.stats.podiumFinishes":
    "Места на подиуме",
  "player.stats.topHalfOfTable":
    "верхняя половина стола",
  "player.stats.biggestTableWon":
    "Самый большой выигранный стол",
  "player.stats.tableSizeAbbr":
    "{count} игр.",
  "player.stats.loadError":
    "Не удалось загрузить твою статистику — проверь подключение и попробуй ещё раз.",
  "player.trophyCase.heading":
    "Витрина трофеев",
  "player.activity.heading":
    "Твоя активность",
  "player.activity.privacyNote":
    "Всё, что ниже, видно только тебе",
  "player.level.progress":
    "Прогресс уровня",
  "player.level.xpProgress":
    "{into} / {span} опыта до уровня {next} · всего {total}",
  "player.closestGoal.progress":
    "{pct}% пути до уровня «{tier}» · {family}",
  "player.closestGoal.view":
    "Смотреть →",
  "player.highlights.rarestUnlock":
    "Самое редкое открытие",
  "player.highlights.tierSuffix":
    "уровень «{tier}»",
  "player.highlights.nothingUnlocked":
    "пока ничего не открыто",
  "player.highlights.toughestAiBeaten":
    "Самый сильный побеждённый ИИ",
  "player.highlights.wins.one":
    "{count} победа",
  "player.highlights.wins.few":
    "{count} победы",
  "player.highlights.wins.many":
    "{count} побед",
  "player.highlights.wins.other":
    "{count} победы",
  "player.highlights.noWinsRecorded":
    "побед не зафиксировано",
  "player.highlights.bestDailyStreak":
    "Лучшая серия «Расклада дня»",
  "player.highlights.daysInARow":
    "дней подряд",
  "player.highlights.bestGame":
    "Лучшая игра",
  "player.highlights.lowestFinalScore":
    "наименьший итоговый счёт",
  "player.winsByDifficulty.heading":
    "Победы по сложности ИИ-соперников",
  "player.multiplayerStats.heading":
    "Сетевые игры (против людей)",
  "player.achievements.viewAll":
    "Смотреть все →",
  "player.achievements.familiesMastered":
    "Освоено семейств: {count} из {total}",
  "player.pastGames.heading":
    "Прошлые игры",
  "player.pastGames.lastN":
    "последние {count}",
  "player.pastGames.empty":
    "Одиночных игр и игр по очереди пока не записано.",
  "player.pastGames.winner":
    "Победитель: {name}",
  "player.pastGames.yourScore":
    "Твой счёт: {score} оч.",
  "player.pastGames.vs":
    "против {names}",
  "player.pastGames.mpHeading":
    "Прошлые сетевые игры",
  "player.pastGames.anAi":
    "ИИ",
  "player.pastGames.youWon":
    "Ты выиграл",
  "player.pastGames.youLeft":
    "Ты вышел",
  "player.pastGames.lostTo":
    "Проигрыш — победил {winner}",
  "player.noGames.body":
    "Игр пока не записано — сыграй одну, и здесь появится твоя статистика. Твой уровень при этом уже учитывает каждое открытое тобой достижение.",
  "achievementFamily.gamesPlayed.title":
    "Завсегдатай стола",
  "achievementFamily.gamesPlayed.unit":
    "сыграно игр",
  "achievementFamily.gamesWon.title":
    "Чемпион",
  "achievementFamily.gamesWon.unit":
    "выиграно игр",
  "achievementFamily.bestScore.title":
    "Снайпер",
  "achievementFamily.bestScore.unit":
    "итоговый счёт за одну игру (минимум 5 сыгранных игр)",
  "achievementFamily.winRate.title":
    "Стабильный",
  "achievementFamily.winRate.unit":
    "% побед (минимум 10 игр)",
  "achievementFamily.mpGamesPlayed.title":
    "Общительный",
  "achievementFamily.mpGamesPlayed.unit":
    "сыграно сетевых игр",
  "achievementFamily.mpGamesWon.title":
    "Дружеское соперничество",
  "achievementFamily.mpGamesWon.unit":
    "выиграно сетевых игр",
  "achievementFamily.mpWinStreak.title":
    "Горячая рука",
  "achievementFamily.mpWinStreak.unit":
    "сетевых побед подряд",
  "achievementFamily.mpWinRate.title":
    "Надёжный соперник",
  "achievementFamily.mpWinRate.unit":
    "% сетевых побед (минимум 6 игр)",
  "achievementFamily.winsVsBeginner.title":
    "Соперник: ИИ-новичок",
  "achievementFamily.winsVsBeginner.unit":
    "побед с ИИ-новичком за столом",
  "achievementFamily.winsVsEasy.title":
    "Соперник: лёгкий ИИ",
  "achievementFamily.winsVsEasy.unit":
    "побед с лёгким ИИ за столом",
  "achievementFamily.winsVsMedium.title":
    "Соперник: средний ИИ",
  "achievementFamily.winsVsMedium.unit":
    "побед со средним ИИ за столом",
  "achievementFamily.winsVsHard.title":
    "Соперник: сложный ИИ",
  "achievementFamily.winsVsHard.unit":
    "побед со сложным ИИ за столом",
  "achievementFamily.winsVsExpert.title":
    "Соперник: ИИ-эксперт",
  "achievementFamily.winsVsExpert.unit":
    "побед с ИИ-экспертом за столом",
  "achievementFamily.booksMelded.title":
    "Книжный червь",
  "achievementFamily.booksMelded.unit":
    "выложено сетов",
  "achievementFamily.runsMelded.title":
    "Бегун",
  "achievementFamily.runsMelded.unit":
    "выложено стритов",
  "achievementFamily.oversizedBooksMelded.title":
    "Битком набитый",
  "achievementFamily.oversizedBooksMelded.unit":
    "выложено увеличенных сетов (больше минимума)",
  "achievementFamily.oversizedRunsMelded.title":
    "Дальний путь",
  "achievementFamily.oversizedRunsMelded.unit":
    "выложено увеличенных стритов (длиннее минимума)",
  "achievementFamily.wildsUsedInMelds.title":
    "Дикая карта",
  "achievementFamily.wildsUsedInMelds.unit":
    "диких карт использовано в комбинациях",
  "achievementFamily.meldsWithZeroWilds.title":
    "Пурист",
  "achievementFamily.meldsWithZeroWilds.unit":
    "натуральных комбинаций (без диких карт)",
  "achievementFamily.cardsLaidOff.title":
    "Разгрузчик",
  "achievementFamily.cardsLaidOff.unit":
    "добавлено карт к комбинациям",
  "achievementFamily.wildsLaidOff.title":
    "Щедрая душа",
  "achievementFamily.wildsLaidOff.unit":
    "добавлено диких карт",
  "achievementFamily.laidOffOntoOpponent.title":
    "Командный игрок",
  "achievementFamily.laidOffOntoOpponent.unit":
    "карт добавлено к комбинации соперника",
  "achievementFamily.ambiguousWildChoicesMade.title":
    "Решительный",
  "achievementFamily.ambiguousWildChoicesMade.unit":
    "неоднозначных размещений дикой карты решено",
  "achievementFamily.cardsDrawnBlind.title":
    "Азартный игрок",
  "achievementFamily.cardsDrawnBlind.unit":
    "карт взято вслепую из колоды",
  "achievementFamily.cardsDrawnFromDiscard.title":
    "Старьёвщик",
  "achievementFamily.cardsDrawnFromDiscard.unit":
    "карт взято из сброса",
  "achievementFamily.wildsDrawn.title":
    "Удачный набор",
  "achievementFamily.wildsDrawn.unit":
    "взято диких карт",
  "achievementFamily.jokersDrawn.title":
    "Власть джокера",
  "achievementFamily.jokersDrawn.unit":
    "взято джокеров",
  "achievementFamily.cardsDiscarded.title":
    "Наводящий порядок",
  "achievementFamily.cardsDiscarded.unit":
    "карт сброшено",
  "achievementFamily.roundsWon.title":
    "Победитель раундов",
  "achievementFamily.roundsWon.unit":
    "выиграно раундов",
  "achievementFamily.roundsWonNoDiscard.title":
    "Чистая победа",
  "achievementFamily.roundsWonNoDiscard.unit":
    "раундов выиграно выходом без нужды в сбросе (кроме финального раунда)",
  "achievementFamily.roundsWonViaDiscard.title":
    "В самый последний момент",
  "achievementFamily.roundsWonViaDiscard.unit":
    "раундов выиграно сбросом последней карты",
  "achievementFamily.roundsWonFinalRound.title":
    "Без рамми",
  "achievementFamily.roundsWonFinalRound.unit":
    "выиграно финальных раундов («3 стрита»)",
  "achievementFamily.zeroPenaltyGames.title":
    "Безупречный",
  "achievementFamily.zeroPenaltyGames.unit":
    "игр завершено с итоговым счётом 0",
  "achievementFamily.completedRound1.title":
    "Два сета — обычное дело",
  "achievementFamily.completedRound1.unit":
    "раз выложено 2 сета",
  "achievementFamily.completedRound2.title":
    "Ассорти",
  "achievementFamily.completedRound2.unit":
    "раз выложено 1 сет + 1 стрит",
  "achievementFamily.completedRound3.title":
    "Прямой бегун",
  "achievementFamily.completedRound3.unit":
    "раз выложено 2 стрита",
  "achievementFamily.completedRound4.title":
    "Тяжелоатлет",
  "achievementFamily.completedRound4.unit":
    "раз выложено 2 сета + 1 стрит",
  "achievementFamily.completedRound5.title":
    "Тройная угроза",
  "achievementFamily.completedRound5.unit":
    "раз выложено 1 сет + 2 стрита",
  "achievementFamily.completedRound6.title":
    "Трилогия",
  "achievementFamily.completedRound6.unit":
    "раз выложено 3 сета",
  "achievementFamily.completedRound7.title":
    "Самый трудный раунд",
  "achievementFamily.completedRound7.unit":
    "раз выложено 3 стрита (вся рука сразу)",
  "achievementFamily.passAndPlayGames.title":
    "Вокруг стола",
  "achievementFamily.passAndPlayGames.unit":
    "игр с 2+ живыми игроками",
  "achievementFamily.soloVsAiGames.title":
    "Сольный номер",
  "achievementFamily.soloVsAiGames.unit":
    "игр в одиночку против ИИ",
  "achievementFamily.largeTableGames.title":
    "Аншлаг",
  "achievementFamily.largeTableGames.unit":
    "игр с 6 и более игроками",
  "achievementFamily.turnsTaken.title":
    "Марафонец",
  "achievementFamily.turnsTaken.unit":
    "сделано ходов",
  "achievementFamily.dailyDealsCompleted.title": "Игрок дня",
  "achievementFamily.dailyDealsCompleted.unit": "пройдено раскладов дня",
  "achievementFamily.dailyDealBestStreak.title": "Хранитель серии",
  "achievementFamily.dailyDealBestStreak.unit": "дней подряд (лучшая серия расклада дня)",
  "achievementFamily.weeklyChallengesCompleted.title": "Претендент",
  "achievementFamily.weeklyChallengesCompleted.unit": "пройдено испытаний недели",
  "achievementFamily.weeklyChallengeBestStreak.title": "Неделя за неделей",
  "achievementFamily.weeklyChallengeBestStreak.unit": "недель подряд (лучшая серия испытания недели)",
  "reviewPrompt.title":
    "Нравится Books & Runs?",
  "reviewPrompt.rateBody":
    "Быстрая оценка очень помогает.",
  "reviewPrompt.feedbackBody":
    "Отличная победа! Пара секунд на отзыв очень помогут.",
  "reviewPrompt.notReally":
    "Не совсем",
  "reviewPrompt.rateUs":
    "Оценить",
  "reviewPrompt.yes":
    "Да!",
  "update.newVersion": "Доступна новая версия Books & Runs.",
  "update.refresh": "Обновить",
  "toast.offline":
    "Ты офлайн — игры по-прежнему работают, а прогресс синхронизируется, когда появится связь.",
  "toast.backOnline": "Связь восстановлена.",
  "toast.saved": "Сохранено",
  "toast.copied": "Скопировано в буфер обмена",
  "toast.syncFailed": "Не удалось синхронизировать — скоро попробуем ещё раз.",
  "install.title": "Установить Books & Runs",
  "install.body":
    "Добавь на главный экран: игра во весь экран, мгновенный запуск и уведомления, когда наступает твой ход.",
  "install.button": "Установить",
  "install.notNow": "Не сейчас",
  "install.ios.title": "Добавь Books & Runs на главный экран",
  "install.ios.body":
    "Нажми на значок «Поделиться», затем «На экран «Домой»». На iPhone и iPad уведомления о твоём ходе работают только после добавления приложения на главный экран.",
  "error.eyebrow": "Что-то сломалось",
  "error.title": "На этом экране произошла ошибка",
  "error.body": "Попробуй ещё раз — если ошибка повторяется, обычно помогает новая игра.",
  "error.freshGame": "Начать новую игру",
  "notFound.eyebrow": "Ошибка 404",
  "notFound.title": "Такой страницы нет",
  "notFound.body": "Возможно, ссылка устарела или в адресе опечатка. С главного экрана всё по-прежнему работает.",
  "globalError.title": "В Books & Runs возникла проблема",
  "globalError.body": "При загрузке приложения что-то пошло не так. Обычно помогает перезагрузка.",
  "globalError.reload": "Перезагрузить",
  "card.canLayOffTitle": "Можно добавить к комбинации на столе",
  "err.generic": "Что-то пошло не так.",
  "err.loadGame": "Не удалось загрузить игру.",
  "err.cancelGame": "Не удалось отменить эту игру.",
  "err.respondInvite": "Не удалось ответить на это приглашение.",
  "err.rematch": "Не удалось начать реванш.",
  "err.signedOut": "Ты вышел из аккаунта.",
  "err.requestFailed": "Запрос не выполнен.",
  "err.signInNotConfigured": "Вход ещё не настроен.",
  "err.noAuthenticator": "Для этого аккаунта не настроено приложение-аутентификатор.",
  "err.auth.invalidCredentials": "Неверная почта или пароль.",
  "err.auth.emailNotConfirmed": "Сначала подтверди почту — проверь входящие.",
  "err.auth.userExists": "Аккаунт с этой почтой уже существует.",
  "err.auth.passwordShort": "Пароль должен содержать не менее {n} символов.",
  "err.auth.passwordSame": "Новый пароль должен отличаться от старого.",
  "err.auth.sessionMissing": "Сеанс истёк — войди снова.",
  "err.auth.tokenExpired": "Этот код или ссылка недействительны или устарели.",
  "err.auth.badTotp": "Неверный код — попробуй ещё раз.",
  "err.auth.rateLimit": "Слишком много попыток — подожди немного и повтори.",
  "err.auth.rateLimitSeconds": "В целях безопасности подожди {n} с, прежде чем повторить.",
  "err.auth.invalidEmail": "Похоже, эта почта недействительна.",
  "err.auth.weakPassword": "Этот пароль слишком простой — выбери другой.",
  "err.cosmeticLocked": "Ты ещё не открыл это.",
  "err.nameTaken": "Это имя уже занято.",
  "err.avatarPreset": "Такого аватара нет среди готовых.",
  "err.badgePreset": "Такого значка нет среди готовых.",
  "err.avatarNotImage": "Этот файл не является изображением.",
  "err.avatarTooLarge": "Изображение слишком большое — выбери файл меньше 20 МБ.",
  "err.avatarRead": "Не удалось прочитать изображение — попробуй другой файл.",
  "err.avatarProcess": "Не удалось обработать изображение.",
  "err.push.notConfigured": "Push-уведомления в этой версии ещё не настроены.",
  "err.push.serviceWorker": "Не удалось зарегистрировать service worker.",
  "err.push.subscribe": "Не удалось оформить подписку в этом браузере.",
  "err.push.malformed": "Некорректная подписка.",
  "err.push.save": "Не удалось сохранить подписку.",
  "err.push.default": "Не удалось включить уведомления.",
  "err.meld.needNatural": "Добавь хотя бы одну карту, не являющуюся джокером.",
  "err.meld.wildLimit": "В комбинации не может быть больше джокеров, чем обычных карт.",
  "err.meld.bookSize": "Для книги нужно карт: минимум {n}.",
  "err.meld.runSize": "Для последовательности нужно карт: минимум {n}.",
  "err.meld.chooseWild": "Выбери, какую карту заменяет джокер.",
  "err.meld.noShare": "У этих карт нет одинакового достоинства (для книги) и они не идут подряд одной масти (для последовательности).",
  "err.mp.pickRound": "Выбери хотя бы один раунд.",
  "err.mp.inviteOne": "Пригласи хотя бы одного друга.",
  "err.mp.playerCount": "Для игры нужно от 2 до 8 игроков.",
  "err.mp.notFriend": "{name} нет в твоём списке друзей.",
  "err.mp.theirCap": "У {name} уже идёт игр: {n}.",
  "err.mp.yourCap": "У тебя уже идёт многопользовательских игр: {n}.",
  "err.mp.createFailed": "Не удалось создать игру.",
  "err.mp.noGame": "Такой игры нет.",
  "err.mp.noInvite": "Для тебя здесь нет ожидающих приглашений.",
  "err.mp.hostOnly": "Отменить может только хозяин игры.",
  "err.mp.alreadyStarted": "Эта игра уже началась.",
  "err.mp.notInGame": "Ты не участвуешь в этой игре.",
  "err.mp.notActive": "Эта игра не активна.",
  "err.mp.notReady": "Игра ещё не готова.",
  "err.mp.unknownAction": "Неизвестное действие.",
  "err.mp.movedOn": "Игра продвинулась — обнови страницу.",
  "err.mp.signInFirst": "Сначала войди в аккаунт.",
  "err.mp.unknownRoute": "Неизвестный маршрут.",
  "err.mp.roundOver": "Раунд окончен.",
  "err.mp.notYourTurn": "Сейчас не твой ход.",
  "err.mp.alreadyDrew": "В этом ходу ты уже брал карту.",
  "err.mp.drawFirst": "Сначала возьми карту.",
  "err.mp.tooManyMeld": "Слишком много карт для одной выкладки.",
  "err.mp.tooManyLayoffs": "Слишком много добавлений за раз.",
  "err.mp.alreadyMelded": "В этом раунде ты уже выложился.",
  "err.mp.meldIncomplete": "Эта выкладка не выполняет контракт раунда.",
  "err.mp.layoffInvalid": "Одно из этих добавлений недопустимо.",
  "err.mp.layoffOne": "Это добавление недопустимо.",
  "err.mp.chooseDiscard": "Выбери карту для сброса.",
  "err.mp.notInHand": "Этой карты нет у тебя на руках.",
  "err.mp.chooseMeldCards": "Выбери карты для выкладки.",
  "err.mp.wentWrong": "Что-то пошло не так.",
  "err.lastRoundLineup": "Не удалось прочитать состав прошлого раунда.",
  "card.newBadge": "НОВ.",
  "meta.homeTitle": "Books & Runs — бесплатная карточная игра Contract Rummy",
  "privacy.title": "Политика конфиденциальности",
  "card.standInAs": "как {rank}",
  "nav.label": "Основная навигация",
  "nav.play": "Игра",
  "nav.progress": "Прогресс",
  "nav.social": "Общение",
  "nav.profile": "Профиль",
  "nav.badge": "Новых: {count}",
  "home.play.continue": "Продолжить",
  "home.play.newGameHint": "Соло, «Передай и играй» или с друзьями",
  "home.viewProgress": "Открыть прогресс",
  "today.title": "Сегодня",
  "today.daily": "День",
  "today.weekly": "Неделя",
  "today.needsAttention": "Здесь что-то ждёт тебя",
  "progress.achievementsDesc": "Все значки и уровни — и что дальше",
  "progress.leaderboardDesc": "Посмотри, какое у тебя место",
  "progress.stats": "Статистика и история",
  "progress.statsDesc": "Твои результаты, серии и прошлые игры",
  "social.signInHint": "Войди, чтобы добавлять друзей и играть онлайн.",
  "social.friendsDesc": "Код друга, заявки и приглашения",
  "social.playDesc": "Начни пошаговую игру с друзьями",
  "social.clubsDesc": "Постоянные группы со своей таблицей",
  "social.tournamentsDesc": "Круговые серии игр с друзьями",
  "profile.myProfile": "Мой профиль",
  "profile.myProfileDesc": "Аватар, имя, о себе и публичная статистика",
  "profile.accountDesc": "Почта, пароль, двухфакторная защита и твои данные",
  "profile.settingsDesc": "Домашние правила, темы, звук и доступность",
  "profile.helpAbout": "Помощь и информация",
} satisfies Record<string, string>;

export default ru;

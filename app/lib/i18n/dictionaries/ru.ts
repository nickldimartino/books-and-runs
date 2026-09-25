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

  "settings.tip.title": "Переносится автоматически при входе",
  "settings.tip.body":
    "Тема, лицевая сторона карт, звук, сложность ИИ и все переключатели ниже синхронизируются с твоим аккаунтом — войди на другом устройстве (или после новой установки через «На экран «Домой»»), и они появятся и там. Если играешь без входа, всё сохраняется только в этом браузере. Не понимаешь, что делает какая-то настройка? Нажми на ⓘ рядом с ней.",

  "settings.section.appearance": "Внешний вид",
  "settings.section.soundAndHaptics": "Звук и вибрация",
  "settings.section.gameplay": "Игровой процесс",
  "settings.section.notifications": "Уведомления",
  "settings.section.help": "Помощь",

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

  "signIn.title": "Вход",
  "signIn.notSetUp.title": "Вход пока не настроен",
  "signIn.notSetUp.body":
    "К этому приложению не подключён проект Supabase. Локальные игры «передай и играй» отлично работают и без него — просто аккаунты и статистика пока недоступны.",
  "signIn.alreadyRegistered":
    "Для этого email уже есть аккаунт. Попробуй войти или воспользуйся ссылкой «Не помнишь пароль?», если не помнишь пароль.",
  "signIn.mfaPrompt": "Введи 6-значный код из приложения-аутентификатора.",
  "signIn.verifying": "Проверка…",
  "signIn.verify": "Проверить",
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
  "multiplayer.playingAsync": "Игра в своём темпе",
  "multiplayer.playingAsyncBody":
    "Не обязательно быть в сети одновременно. Сделай ход — и очередь переходит следующему игроку; загляни на главную позже или включи уведомления в настройках, чтобы узнать, когда снова наступит твой ход.",
  "multiplayer.roundSummary.heading": "Раунд {round} · {label}",
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
  "multiplayer.meldAndDiscard": "Выложить и сбросить",
  "multiplayer.contractReadyHint": "Твой контракт готов. Выбери одну карту для сброса и нажми «Выложить и сбросить» — комбинация и сброс отправляются вместе и завершают твой ход.",
  "multiplayer.meldConfirmPrompt": "Выложить свою комбинацию и сбросить {card}?",
  "multiplayer.stagedIncomplete": "Твои отложенные группы пока не соответствуют контракту этого раунда. Добавь или убери группы, чтобы выполнить его, перед сбросом.",
  "multiplayer.syncError": "Не удалось обновить — показано последнее известное состояние игры.",
  "multiplayer.handEmpty": "Твоя рука пуста — заверши ход, чтобы выйти.",

  "common.close": "Закрыть",

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
  "home.dailyDeal.continue": "Продолжить сегодняшний расклад",
  "home.dailyDeal.play": "Сыграть сегодняшний расклад",
  "home.leftInProgress": "Эта игра осталась незавершённой.",
  "home.playAgain": "Играть снова",

  "home.weeklyChallenge.title": "Испытание недели",
  "home.weeklyChallenge.signInHint": "Войди, чтобы вести серию побед — сыграть испытание этой недели может кто угодно.",
  "home.weeklyChallenge.streak": "🏆 {count} нед. подряд",
  "home.weeklyChallenge.description": "Полная игра на 7 раундов против 3 ИИ уровня «Сложный» — на этой неделе стол одинаковый для всех.",
  "home.weeklyChallenge.streakProtected": "Серия защищена на эту неделю.",
  "home.weeklyChallenge.continue": "Продолжить испытание этой недели",
  "home.weeklyChallenge.play": "Сыграть испытание этой недели",

  "home.progressTile.profile": "Профиль",
  "home.progressTile.achievements": "Достижения",
  "home.progressTile.leaderboard": "Таблица лидеров",
  "home.progressTile.friends": "Друзья",

  "home.closestAchievement": "Ближайшее достижение",

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
  "clubs.confirmDelete": "Удалить «{name}»? Клуб будет удалён для всех участников.",
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
  "account.delete.heading": "Удалить аккаунт",
  "account.delete.bodyPrefix":
    "Самостоятельно удалить аккаунт пока нельзя. Чтобы удалить аккаунт и всё, что с ним связано, — статистику, историю игр, достижения, отображаемое имя, друзей и сетевые игры, — напиши на",
  "account.delete.bodySuffix": "с адреса, привязанного к аккаунту.",
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
    "Обновлено 12 августа 2026 г.",
  "terms.intro":
    "Пользуясь Books & Runs («приложением»), ты соглашаешься с этими условиями. Если ты не согласен с ними, пожалуйста, не пользуйся приложением.",
  "terms.app.title":
    "Приложение",
  "terms.app.bodyPrefix":
    "Books & Runs — карточная игра для игры за одним устройством по очереди и одиночных партий против ИИ-соперников. Она полностью работает офлайн и без аккаунта. Создание аккаунта необязательно: он открывает статистику на всех устройствах, достижения и уровень аккаунта. Подробности — ознакомься с нашей",
  "terms.app.bodySuffix":
    ".",
  "terms.accounts.title":
    "Аккаунты",
  "terms.accounts.body":
    "Если ты создаёшь аккаунт, ты отвечаешь за сохранность своих учётных данных и за всё, что происходит под твоим аккаунтом. При регистрации указывай достоверные сведения.",
  "terms.acceptableUse.title":
    "Допустимое использование",
  "terms.acceptableUse.body":
    "Не используй приложение, чтобы мешать его нормальной работе, пытаться получить доступ к данным других пользователей или для чего-либо противозаконного.",
  "terms.ip.title":
    "Интеллектуальная собственность",
  "terms.ip.body":
    "Дизайн, код и контент приложения принадлежат его разработчику. Правила карточной игры, лежащей в основе приложения, — распространённый вариант домашних правил и никому не принадлежат.",
  "terms.disclaimer.title":
    "Отказ от гарантий и ограничение ответственности",
  "terms.disclaimer.body":
    "Приложение предоставляется «как есть», без каких-либо гарантий. В максимальной степени, разрешённой законом, разработчик не несёт ответственности за любой ущерб, возникший из-за использования приложения.",
  "terms.termination.title":
    "Прекращение использования",
  "terms.termination.body":
    "Ты можешь в любой момент прекратить пользоваться приложением или удалить аккаунт (как это сделать — см. в Политике конфиденциальности). Мы можем приостановить или прекратить действие аккаунтов, нарушающих эти условия.",
  "terms.changes.title":
    "Изменения условий",
  "terms.changes.body":
    "Если эти условия изменятся, мы обновим дату в верхней части этой страницы.",
  "terms.contact.body":
    "Вопросы по этим условиям? Пиши на",
  "privacy.lastUpdated":
    "Обновлено 11 сентября 2026 г.",
  "privacy.overview.title":
    "Обзор",
  "privacy.overview.body":
    "Books & Runs — карточная игра, в которую можно играть полностью офлайн, на одном устройстве и без аккаунта. Эта политика объясняет, что происходит, если ты решишь создать аккаунт, и подтверждает, чего мы не собираем никогда.",
  "privacy.localPlay.title":
    "Для локальной игры аккаунт не нужен",
  "privacy.localPlay.body":
    "Если ты ни разу не входишь в аккаунт, приложение ничего не собирает. Твоя текущая партия и выбранные настройки домашних правил хранятся только в локальном хранилище твоего браузера или устройства, никуда не передаются и нам не видны.",
  "privacy.account.title":
    "Если ты создаёшь аккаунт",
  "privacy.account.intro":
    "Вход необязателен и открывает Статистику, Достижения, уровень аккаунта, Таблицу лидеров, Друзей и пошаговые сетевые игры. Если ты входишь по электронной почте, мы храним:",
  "privacy.account.item.email":
    "Твой адрес электронной почты — через нашего провайдера аутентификации (Supabase Auth).",
  "privacy.account.item.stats":
    "Статистику игр, привязанную к аккаунту: сыгранные и выигранные игры, лучший, худший и средний счёт, а также победы с разбивкой по сложности ИИ-соперников.",
  "privacy.account.item.history":
    "Историю завершённых игр: соперников (ИИ или других игроков), счёт по раундам, победителя и время игры.",
  "privacy.account.item.achievements":
    "Прогресс достижений: количество определённых игровых действий — выложенных комбинаций, добавленных карт, раундов, выигранных определённым способом, и тому подобное, — по которым определяется, какие достижения открыты. Уровень аккаунта рассчитывается по этим данным и статистике выше и отдельно не хранится.",
  "privacy.account.item.displayName":
    "Отображаемое имя, если ты его задал. Оно необязательно, видно другим вошедшим игрокам в Таблице лидеров и твоим друзьям и не обязано быть настоящим именем. Пока имя не задано, ты отображаешься под сгенерированным ярлыком вроде «Игрок 4821».",
  "privacy.account.item.friendsPrefix":
    "Индивидуальный для аккаунта",
  "privacy.account.item.friendCodeLabel":
    "код друга",
  "privacy.account.item.friendsSuffix":
    "и список друзей: какие аккаунты ты добавил в друзья и какие запросы в друзья, ещё не принятые, ты отправил или получил. Когда ты добавляешь друга, твоё отображаемое имя становится видно ему, а его — тебе.",
  "privacy.account.item.multiplayer":
    "Данные сетевых игр: для каждой пошаговой игры, которую ты начинаешь или к которой присоединяешься, — другие участники, рассадка, чей сейчас ход, количество карт на руках, счёт и итоговый результат. Полное состояние игры (включая перемешанную колоду и руку каждого игрока) хранится на стороне сервера и показывается игроку только как его собственный вид — руку другого игрока ты не увидишь.",
  "privacy.account.item.aiDifficulty":
    "Твоя сложность ИИ по умолчанию, если она задана на экране «Настройки». (Тема, рубашка карт, режим для дальтоников и включение/выключение звука и вибрации тоже задаются там, но остаются на твоём устройстве и нам не отправляются.)",
  "privacy.account.outro":
    "Мы не требуем настоящего имени и не собираем данные о местоположении, контактах и фотографиях и не запрашиваем никаких разрешений устройства. В приложении нет рекламы, а также аналитических и отслеживающих SDK.",
  "privacy.processors.title":
    "Кто обрабатывает эти данные",
  "privacy.processors.bodyPrefix":
    "Данные аккаунта хранятся в базе Postgres, размещённой у",
  "privacy.processors.linkText":
    "Supabase",
  "privacy.processors.bodySuffix":
    "и защищённой на уровне строк, поэтому, кроме отображаемого имени и статистики, намеренно показываемых в Таблице лидеров, читать и изменять свои строки можешь только ты. Ходы в пошаговых сетевых играх проверяет Edge Function Supabase, которая запускает тот же игровой движок; только она может видеть полное скрытое состояние игры.",
  "privacy.export.title":
    "Экспорт и удаление данных",
  "privacy.export.bodyPrefix":
    "На странице аккаунта есть кнопка",
  "privacy.export.downloadLabel":
    "Скачать мои данные",
  "privacy.export.bodyMiddle":
    ", которая в любой момент выдаёт всё перечисленное выше одним файлом, без запроса. Данные аккаунта хранятся, пока существует твой аккаунт. Чтобы удалить аккаунт и всё, что с ним связано, — статистику, историю игр, прогресс достижений, отображаемое имя, друзей и сетевые игры, — напиши на",
  "privacy.export.bodySuffix":
    "с адреса, привязанного к аккаунту, и мы удалим данные в разумный срок. При удалении аккаунта ты также исчезаешь из списков друзей других игроков.",
  "privacy.children.title":
    "Конфиденциальность детей",
  "privacy.children.body":
    "Приложение не предназначено для детей младше 13 лет, и мы сознательно не собираем их персональные данные.",
  "privacy.changes.title":
    "Изменения этой политики",
  "privacy.changes.body":
    "Если эта политика изменится, мы обновим дату в верхней части этой страницы.",
  "privacy.contact.body":
    "Вопросы или хочешь удалить свои данные? Пиши на",
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
  "tournaments.confirmCancel":
    "Отменить этот турнир? Уже сыгранные игры сохранят свои результаты.",
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
    "Пожаловаться на фото",
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
} satisfies Record<string, string>;

export default ru;

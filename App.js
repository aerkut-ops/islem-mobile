import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { getLocales } from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import {
  Animated,
  Easing,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AccountPanel from './src/components/AccountPanel';
import { loadPlayerCloudProgress } from './src/services/playerCloudData';
import {
  handleAuthCallback,
  subscribeToAuthChanges,
} from './src/services/authService';
import {
  buildGameResultPayload,
  flushQueuedGameResults,
  submitGameResult,
} from './src/services/gameResultSync';
import {
  getCurrentSession,
  isSupabaseConfigured,
} from './src/services/supabaseClient';
import {
  getActiveStreak,
  getMillisecondsUntilNextDay,
} from './src/utils/streak';

const ALL_OPERATIONS = ['+', '-', '×', '÷'];

const DIFFICULTIES = {
  paper: {
    label: 'Örnek',
    boardSize: 3,
    ops: ['+', '-'],
    source: [1, 4, 5, 8],
    targets: [
      {
        value: 11,
        row: 0,
        col: 0,
        solution: [
          { a: 8, b: 4, op: '+', result: 12 },
          { a: 12, b: 1, op: '-', result: 11 },
        ],
      },
      {
        value: 2,
        row: 1,
        col: 1,
        solution: [
          { a: 5, b: 4, op: '-', result: 1 },
          { a: 1, b: 1, op: '+', result: 2 },
        ],
      },
      {
        value: 13,
        row: 2,
        col: 1,
        solution: [{ a: 8, b: 5, op: '+', result: 13 }],
      },
    ],
    par: 4,
    name: 'İlk oyun',
  },
  easy: {
    label: 'Kolay',
    boardSize: 3,
    sourceCount: 4,
    targetCount: 3,
    maxBase: 9,
    maxTarget: 24,
    ops: ['+', '-'],
    chainDepths: [1, 1, 1, 2],
    name: 'Kolay oyun',
  },
  medium: {
    label: 'Orta',
    boardSize: 3,
    sourceCount: 5,
    targetCount: 4,
    maxBase: 10,
    maxTarget: 80,
    ops: ['+', '-', '×'],
    chainDepths: [1, 1, 2, 2],
    name: 'Orta oyun',
  },
  hard: {
    label: 'Zor',
    boardSize: 4,
    sourceCount: 5,
    targetCount: 5,
    maxBase: 12,
    maxTarget: 144,
    ops: ['+', '-', '×', '÷'],
    chainDepths: [1, 2, 2, 3],
    name: 'Zor oyun',
  },
  master: {
    label: 'Usta',
    boardSize: 4,
    sourceCount: 6,
    targetCountRange: [8, 10],
    maxBase: 15,
    maxTarget: 999,
    ops: ['+', '-', '×', '÷'],
    chainDepths: [2, 2, 3, 3, 4],
    name: 'Usta oyun',
  },
  weekly: {
    label: 'Haftalık',
    boardSize: 4,
    sourceCount: 6,
    targetCountRange: [9, 10],
    maxBase: 18,
    maxTarget: 999,
    ops: ['+', '-', '×', '÷'],
    chainDepths: [3, 3, 4, 4, 5],
    name: 'Haftalık meydan okuma',
  },
};

const BEST_SCORE_PREFIX = 'islem-best';
const PROGRESS_KEY = 'islem-progress-v1';
const PROGRESS_OWNER_KEY_PREFIX = `${PROGRESS_KEY}:owner`;
const MODE_NORMAL = 'normal';
const MODE_DAILY = 'daily';
const MODE_WEEKLY = 'weekly';
const PLAYABLE_DIFFICULTIES = ['easy', 'medium', 'hard', 'master'];
const SOUND_DEBOUNCE_MS = 90;
const BADGE_DEFS = [
  { id: 'first_win', icon: '1' },
  { id: 'daily_first', icon: 'D', recurring: 'daily' },
  { id: 'weekly_first', icon: 'W' },
  { id: 'streak_3', icon: '3' },
  { id: 'streak_7', icon: '7' },
  { id: 'streak_14', icon: '14' },
  { id: 'perfect', icon: '=' },
  { id: 'games_5', icon: '5' },
  { id: 'games_20', icon: '20' },
  { id: 'targets_50', icon: '50' },
  { id: 'score_1000', icon: '1K' },
  { id: 'score_5000', icon: '5K' },
];
const LEAGUE_DEFS = [
  { id: 'bronze', min: 0, icon: 'B' },
  { id: 'silver', min: 300, icon: 'S' },
  { id: 'gold', min: 700, icon: 'G' },
  { id: 'diamond', min: 1200, icon: 'D' },
  { id: 'mastery', min: 2000, icon: 'U' },
];
const DEFAULT_PROGRESS = {
  achievements: {},
  completedDailyDates: {},
  completedStreakDates: {},
  completedWeeklyKeys: {},
  stats: {
    bestScore: 0,
    gamesCompleted: 0,
    gamesPlayed: 0,
    perfectGames: 0,
    targetsSolved: 0,
    totalMoves: 0,
    totalScore: 0,
  },
  streak: {
    best: 0,
    current: 0,
    lastDailyDate: null,
  },
  weeklyScores: {},
};

const STRINGS = {
  tr: {
    appName: 'İşlem',
    eyebrow: 'Hedefe ulaş',
    stats: {
      score: 'Puan',
      moves: 'İşlem',
      target: 'Hedef',
      time: 'Süre',
    },
    actions: {
      sound: 'Ses',
      soundOn: 'Sesi kapat',
      soundOff: 'Sesi aç',
      reset: 'Sıfırla',
      resetA11y: 'Bu oyunu sıfırla',
      newGame: 'Yeni',
      newGameA11y: 'Yeni oyun başlat',
      home: 'Ana ekran',
      homeA11y: 'Ana ekrana dön',
      settings: 'Ayarlar',
      settingsA11y: 'Ayarları aç',
      hint: 'İpucu',
      hintA11y: 'İpucu göster',
      close: 'Kapat',
      closeA11y: 'Paneli kapat',
      undo: 'Geri al',
      undoA11y: 'Son işlemi geri al',
      swap: 'Yer değiştir',
      swapA11y: 'Sayıların yerini değiştir',
      closeDial: 'İşlem kadranını kapat',
      advanceTutorial: 'Öğretici adımını ilerlet',
    },
    difficulties: {
      paper: 'Örnek',
      easy: 'Kolay',
      medium: 'Orta',
      hard: 'Zor',
      master: 'Usta',
      weekly: 'Haftalık',
    },
    gameNames: {
      paper: 'İlk oyun',
      easy: 'Kolay oyun',
      medium: 'Orta oyun',
      hard: 'Zor oyun',
      master: 'Usta oyun',
      weekly: 'Haftalık meydan okuma',
    },
    board: {
      title: 'Hedefler',
      ideal: 'İdeal',
      solved: 'TAMAM',
      target: 'HEDEF',
    },
    racks: {
      given: 'Verilen sayılar',
      drag: 'Sürükle',
      results: 'Ara sonuçlar',
      emptyResults: 'İşlem yapınca sonuçlar burada görünür.',
    },
    history: {
      title: 'Son işlemler',
      empty: 'Henüz işlem yok.',
      hit: ' hedef',
      miss: ' ara',
    },
    dial: {
      title: 'İşlem seç',
      operationA11y: (op) => `${op} işlemini seç`,
    },
    tutorial: [
      {
        title: 'İşlem’e hoş geldin',
        text: 'Amaç, verilen sayıları kullanarak tahtadaki hedef sayılara ulaşmak.',
      },
      {
        title: 'Sayıyı tut',
        text: 'Alttaki sarı sayılardan birini parmağınla tut.',
      },
      {
        title: 'Başka sayıya bırak',
        text: 'Tuttuğun sayıyı diğer bir sayının üzerine bırakınca işlem kadranı açılır.',
      },
      {
        title: 'İşlemi seç',
        text: '+, -, × veya ÷ seç. Sonuç hedeflerden biriyse kare tamamlanır.',
      },
      {
        title: 'Devam et',
        text: 'Ara sonuçları da yeni sayılar gibi sürükleyebilirsin. Şimdi deneyelim.',
      },
    ],
    tutorialNext: 'Devam etmek için dokun',
    tutorialStart: 'Başla',
    messages: {
      start: 'Bir sayıyı tut, başka bir sayının üzerine bırak.',
      selectionCleared: 'Seçim temizlendi. Bir sayıyı başka bir sayının üzerine sürükle.',
      undone: 'Son işlem geri alındı.',
      dragToAnother: (value) => `${value} sayısını başka bir sayının üzerine bırak.`,
      dropOnNumber: 'İşlem yapmak için sayıyı başka bir sayının üzerine bırak.',
      chooseOperation: (a, b) => `${a} ve ${b} için işlemi seç.`,
      targetDone: (value) => `${value} hedefi tamamlandı.`,
      resultAdded: (value) => `${value} ara sonuçlara eklendi.`,
      hintReady: 'İpucu iki sayıyı işaretledi.',
      hintUnavailable: 'Şu an uygun ipucu bulunamadı.',
      complete: 'Tüm hedefler tamamlandı. Yeni oyunla devam edebilirsin.',
      negative: 'Sonuç negatif oldu. Yer değiştirip tekrar dene.',
      zero: 'Bu sürümde sıfır sonuç kullanılmıyor.',
      divideByZero: 'Sıfıra bölme yok.',
      divisionInteger: 'Bölme sonucu tam sayı olmalı.',
      unsupported: 'Bu işlem desteklenmiyor.',
    },
    modes: {
      normal: 'Normal oyun',
      daily: 'Günün bulmacası',
      weekly: 'Haftalık meydan okuma',
    },
    status: {
      streak: 'Seri',
      weekly: 'Hafta',
      league: 'Lig',
      dayDone: 'Bugün tamam',
    },
    streakPage: {
      title: 'Seri',
      dailyTitle: (count) => `${count} Günlük Seri!`,
      current: 'Mevcut seri',
      best: 'En iyi seri',
      todayDone: 'Bugün bir oyun tamamlandı. Ateşin yanıyor.',
      todayOpen: 'Ateşi yakmak için bugün bir oyun tamamla.',
      dayLabels: ['P', 'P', 'S', 'Ç', 'P', 'C', 'C'],
    },
    settings: {
      title: 'Ayarlar',
      stats: 'İstatistikler',
      game: 'Oyun',
      challenges: 'Meydan okuma',
      leaderboard: 'Haftalık liste',
      achievements: 'Rozetler',
      chooseDifficulty: 'Zorluk seç',
      soundOn: 'Ses açık',
      soundOff: 'Ses kapalı',
      startDaily: 'Günün bulmacasını aç',
      startWeekly: 'Haftalık meydan okumayı aç',
      localLeaderboardNote: 'Şimdilik cihaz içi liste. Arkadaş listesi için online sistem gerekir.',
      you: 'Sen',
      gamesCompleted: 'Bitirilen',
      totalScore: 'Toplam puan',
      bestScore: 'En iyi',
      totalMoves: 'Toplam işlem',
      currentStreak: 'Günlük seri',
      bestStreak: 'En iyi seri',
      weeklyScore: 'Bu hafta',
      homeSubtitle: 'Oyun modlarını göster',
    },
    account: {
      icon: 'K',
      eyebrow: 'Bulut hesabı',
      title: 'Hesap',
      close: 'Hesap ekranını kapat',
      loading: 'Oturum kontrol ediliyor...',
      signedIn: 'Oturum açık',
      cloudReady: 'Bulut kaydı hazır',
      cloudText: 'Yeni oyun sonuçların bu hesaba güvenle eşitlenir.',
      cloudStats: 'Bulut istatistikleri',
      statsLoading: 'İstatistikler yükleniyor...',
      statsError: 'Bulut istatistikleri şu anda yüklenemedi.',
      totalScore: 'Toplam puan',
      completedGames: 'Tamamlanan oyun',
      solvedTargets: 'Çözülen hedef',
      currentStreak: 'Mevcut seri',
      signOut: 'Çıkış yap',
      deleteTitle: 'Hesabı sil',
      deleteText: 'Hesabınla birlikte bulut skorların, serin ve profil bilgilerin kalıcı olarak silinir.',
      deleteAccount: 'Hesabımı sil',
      deleteConfirmText: 'Bu işlem geri alınamaz. Hesabını ve bulut verilerini kalıcı olarak silmek istediğine emin misin?',
      cancel: 'Vazgeç',
      deleteForever: 'Kalıcı olarak sil',
      deleteError: 'Hesap silinemedi. İnternet bağlantını kontrol edip tekrar dene.',
      guestTitle: 'İlerlemeni yanında taşı',
      guestText: 'Skorlarını ve serini korumak için e-posta adresinle giriş yap veya ücretsiz hesap oluştur.',
      emailLabel: 'E-posta',
      emailPlaceholder: 'ornek@eposta.com',
      magicLinkMethod: 'E-posta bağlantısı',
      passwordMethod: 'Şifre',
      magicLinkHelp: 'Şifre gerekmez. E-postana gelen güvenli bağlantıya dokunman yeterli.',
      passwordLabel: 'Şifre',
      passwordPlaceholder: 'Şifreni yaz',
      passwordHelp: 'Daha önce şifre belirlenmiş hesaplar için.',
      passwordContinue: 'Şifreyle giriş yap',
      passwordRequired: 'Şifreni yaz.',
      invalidCredentials: 'E-posta adresi veya şifre hatalı.',
      continue: 'Giriş yap / Hesap oluştur',
      linkSent: 'Bağlantı gönderildi. E-posta kutunu kontrol et.',
      emailRateLimit: 'Çok kısa sürede fazla giriş e-postası istendi. Yaklaşık bir saat sonra tekrar dene.',
      invalidEmail: 'Geçerli bir e-posta adresi yaz.',
      genericError: 'İşlem tamamlanamadı. Lütfen tekrar dene.',
      security: {
        eyebrow: 'Güvenli giriş',
        title: 'Güvenlik kontrolü',
        help: 'Devam etmek için kısa güvenlik kontrolünü tamamla.',
        loading: 'Kontrol hazırlanıyor...',
        cancel: 'Vazgeç',
      },
      securityError: 'Güvenlik kontrolü tamamlanamadı. Lütfen tekrar dene.',
      privacy: 'Misafir olarak oynamaya devam edebilirsin. Hesap yalnızca çevrimiçi özellikler için gerekir.',
      privacyPolicy: 'Gizlilik Politikası',
      privacyPolicyA11y: 'Gizlilik politikasını aç',
      unavailableTitle: 'Hesap sistemi hazırlanıyor',
      unavailableText: 'Oyun misafir olarak çalışmaya devam ediyor. Supabase bağlantısı tamamlandığında giriş burada açılacak.',
      buttonA11y: 'Hesap ve profil ekranını aç',
      guestShort: 'Misafir',
    },
    home: {
      title: 'İşlem',
      eyebrow: 'Oyun modu seç',
      dailyTitle: 'Günlük Oyun',
      dailyText: 'Her gün aynı özel bulmaca. İlk tamamlamada %50 puan bonusu ve seri ilerlemesi verir.',
      dailyDone: 'Bugün puan alındı',
      dailyReady: 'Bugün hazır',
      dailyButton: 'Günlüğü oyna',
      dailyPageTitle: 'Günlük Oyun',
      dailyPageText: 'Bugünün bulmacasını hangi zorlukta oynamak istediğini seç. İlk tamamlaman günlük bonusu ve seri ilerlemesini verir.',
      trainingTitle: 'Antrenman',
      trainingText: 'Kendi hızında pratik yap. Zorluk seç, yeni bulmacalar üret ve hamlelerini geliştir.',
      trainingPageTitle: 'Antrenman',
      trainingPageText: 'Kendi hızında pratik yap. Zorluk seviyesini seç, yeni bulmacalar üret ve hamlelerini geliştir.',
      trainingDifficulty: 'Zorluk seviyesi',
      weeklyTitle: 'Haftalık Meydan Okuma',
      weeklyText: 'Haftada bir yenilenen özel bulmacayı çöz. İlk tamamlaman lig puanına yazılır ve rozet kazandırır.',
      weeklyPageTitle: 'Haftalık Meydan Okuma',
      weeklyPageText: 'Bu bulmaca haftada bir yenilenir. Haftanın ilk tamamlaması puan verir, haftalık rozeti açar ve lig listene eklenir.',
      weeklyDone: 'Bu hafta tamamlandı',
      weeklyReady: 'Bu haftanın bulmacası hazır',
      weeklyButton: 'Haftalık bulmacayı oyna',
      challengeTitle: 'Meydan Okuma',
      challengeText: 'Arkadaşlarınla zamana karşı yarışma modu.',
      challengePageTitle: 'Meydan Okuma',
      challengePageText: 'Arkadaşlarınla veya eşleşen oyuncularla aynı bulmacada yarışma sistemi hazırlanıyor.',
      challengeStatusTitle: 'Gelişim aşamasında',
      challengeStatusText: 'Oda kurma, arkadaş daveti ve canlı yarış akışı burada olacak. Şimdilik bu modu ayrı tutuyoruz.',
      challengeDone: 'Bu hafta puan alındı',
      challengeReady: 'Haftalık hazır',
      challengeButton: 'Yakında',
      roomTitle: 'Oda sistemi',
      roomCreate: 'Oda oluştur',
      roomSearch: 'Rakip ara',
      roomCode: 'Oda kodu',
      roomWaiting: 'Oda hazır. Kodu arkadaşına gönder veya arama yapan oyuncuyu bekle.',
      roomMatched: (name) => `${name} katıldı. Yarışa başlayabilirsin.`,
      roomStart: 'Yarışı başlat',
      roomReset: 'Odayı kapat',
      weeklyStart: 'Haftalık bulmacayı oyna',
      tutorialTitle: 'Öğretici',
      tutorialText: 'Örnek bölümde sürükle-bırak, işlem kadranı ve ara sonuçları adım adım öğren.',
      tutorialButton: 'Öğreticiyi aç',
      back: 'Geri',
      badgesTitle: 'Rozetler',
      statsTitle: 'İstatistikler',
      badgesProgress: (earned, total) => `${earned}/${total} açık`,
      badgeUnlocked: 'Açık',
      badgeLocked: 'Kilitli',
      streak: 'Seri',
      weekly: 'Hafta puanı',
      league: 'Lig',
      best: 'En iyi',
    },
    completion: {
      title: 'Bölüm tamamlandı',
      score: 'Puan',
      moves: 'İşlem',
      targets: 'Hedef',
      streak: 'Seri',
      league: 'Lig',
      newBadges: 'Yeni rozetler',
      noNewBadges: 'Yeni rozet yok',
      next: 'Yeni oyun',
      close: 'Oyuna dön',
    },
    badges: {
      first_win: {
        title: 'İlk Zafer',
        description: 'İlk bulmacanı tamamla.',
      },
      daily_first: {
        title: 'Günün Oyuncusu',
        description: 'Bugünün günlük bulmacasını tamamla. Her gün sıfırlanır.',
      },
      weekly_first: {
        title: 'Haftalık Yarışçı',
        description: 'Haftalık meydan okumayı tamamla.',
      },
      streak_3: {
        title: 'Üç Gün',
        description: '3 günlük seri yap.',
      },
      streak_7: {
        title: 'Haftalık Seri',
        description: '7 günlük seri yap.',
      },
      streak_14: {
        title: 'İki Hafta',
        description: '14 günlük seri yap.',
      },
      perfect: {
        title: 'İdeal Çözüm',
        description: 'Bir bulmacayı ideal işlem sayısında bitir.',
      },
      games_5: {
        title: 'Isınma Turu',
        description: '5 bulmaca tamamla.',
      },
      games_20: {
        title: 'Alışkanlık',
        description: '20 bulmaca tamamla.',
      },
      targets_50: {
        title: 'Hedef Avcısı',
        description: '50 hedef çöz.',
      },
      score_1000: {
        title: 'Binlik',
        description: 'Toplam 1000 puana ulaş.',
      },
      score_5000: {
        title: 'Puan Avcısı',
        description: 'Toplam 5000 puana ulaş.',
      },
    },
    leagues: {
      bronze: 'Bronz',
      silver: 'Gümüş',
      gold: 'Altın',
      diamond: 'Elmas',
      mastery: 'Ustalık',
    },
    leaderboard: {
      title: 'Haftalık lig',
      week: 'Bu hafta',
      rivals: ['Ada', 'Mert', 'Elif', 'Deniz', 'Can', 'Lara'],
    },
  },
  en: {
    appName: 'İşlem',
    eyebrow: 'Reach the target',
    stats: {
      score: 'Score',
      moves: 'Moves',
      target: 'Target',
      time: 'Time',
    },
    actions: {
      sound: 'Sound',
      soundOn: 'Turn sound off',
      soundOff: 'Turn sound on',
      reset: 'Reset',
      resetA11y: 'Reset this game',
      newGame: 'New',
      newGameA11y: 'Start a new game',
      home: 'Home',
      homeA11y: 'Go to home screen',
      settings: 'Settings',
      settingsA11y: 'Open settings',
      hint: 'Hint',
      hintA11y: 'Show hint',
      close: 'Close',
      closeA11y: 'Close panel',
      undo: 'Undo',
      undoA11y: 'Undo last move',
      swap: 'Swap',
      swapA11y: 'Swap the numbers',
      closeDial: 'Close operation dial',
      advanceTutorial: 'Advance tutorial step',
    },
    difficulties: {
      paper: 'Example',
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      master: 'Master',
      weekly: 'Weekly',
    },
    gameNames: {
      paper: 'First game',
      easy: 'Easy game',
      medium: 'Medium game',
      hard: 'Hard game',
      master: 'Master game',
      weekly: 'Weekly challenge',
    },
    board: {
      title: 'Targets',
      ideal: 'Ideal',
      solved: 'DONE',
      target: 'TARGET',
    },
    racks: {
      given: 'Given numbers',
      drag: 'Drag',
      results: 'Results',
      emptyResults: 'Results will appear here after you make a move.',
    },
    history: {
      title: 'Recent moves',
      empty: 'No moves yet.',
      hit: ' target',
      miss: ' result',
    },
    dial: {
      title: 'Choose operation',
      operationA11y: (op) => `Choose ${op}`,
    },
    tutorial: [
      {
        title: 'Welcome to İşlem',
        text: 'Use the given numbers to reach the target numbers on the board.',
      },
      {
        title: 'Hold a number',
        text: 'Hold one of the yellow numbers at the bottom.',
      },
      {
        title: 'Drop it on another',
        text: 'Drop it on another number to open the operation dial.',
      },
      {
        title: 'Pick an operation',
        text: 'Choose +, -, ×, or ÷. If the result matches a target, that square is completed.',
      },
      {
        title: 'Keep going',
        text: 'You can drag result numbers too. Now try it yourself.',
      },
    ],
    tutorialNext: 'Tap to continue',
    tutorialStart: 'Start',
    messages: {
      start: 'Hold a number and drop it on another number.',
      selectionCleared: 'Selection cleared. Drag a number onto another one.',
      undone: 'Last move undone.',
      dragToAnother: (value) => `Drop ${value} on another number.`,
      dropOnNumber: 'Drop the number on another number to make an operation.',
      chooseOperation: (a, b) => `Choose an operation for ${a} and ${b}.`,
      targetDone: (value) => `${value} target completed.`,
      resultAdded: (value) => `${value} added to results.`,
      hintReady: 'Hint marked two numbers.',
      hintUnavailable: 'No useful hint is available right now.',
      complete: 'All targets completed. Start a new game to continue.',
      negative: 'The result is negative. Swap the numbers and try again.',
      zero: 'Zero results are not used in this version.',
      divideByZero: 'No division by zero.',
      divisionInteger: 'Division must result in a whole number.',
      unsupported: 'This operation is not supported.',
    },
    modes: {
      normal: 'Normal game',
      daily: 'Daily puzzle',
      weekly: 'Weekly challenge',
    },
    status: {
      streak: 'Streak',
      weekly: 'Week',
      league: 'League',
      dayDone: 'Done today',
    },
    streakPage: {
      title: 'Streak',
      dailyTitle: (count) => `${count} Day Streak!`,
      current: 'Current streak',
      best: 'Best streak',
      todayDone: 'A game is complete today. Your fire is lit.',
      todayOpen: 'Complete any game today to light the fire.',
      dayLabels: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    },
    settings: {
      title: 'Settings',
      stats: 'Stats',
      game: 'Game',
      challenges: 'Challenges',
      leaderboard: 'Weekly board',
      achievements: 'Badges',
      chooseDifficulty: 'Choose difficulty',
      soundOn: 'Sound on',
      soundOff: 'Sound off',
      startDaily: 'Open daily puzzle',
      startWeekly: 'Open weekly challenge',
      localLeaderboardNote: 'Local list for now. Friends require an online system.',
      you: 'You',
      gamesCompleted: 'Completed',
      totalScore: 'Total score',
      bestScore: 'Best',
      totalMoves: 'Total moves',
      currentStreak: 'Daily streak',
      bestStreak: 'Best streak',
      weeklyScore: 'This week',
      homeSubtitle: 'Show game modes',
    },
    account: {
      icon: 'A',
      eyebrow: 'Cloud account',
      title: 'Account',
      close: 'Close account screen',
      loading: 'Checking session...',
      signedIn: 'Signed in',
      cloudReady: 'Cloud sync ready',
      cloudText: 'New game results are safely synced to this account.',
      cloudStats: 'Cloud statistics',
      statsLoading: 'Loading statistics...',
      statsError: 'Cloud statistics could not be loaded right now.',
      totalScore: 'Total score',
      completedGames: 'Completed games',
      solvedTargets: 'Solved targets',
      currentStreak: 'Current streak',
      signOut: 'Sign out',
      deleteTitle: 'Delete account',
      deleteText: 'Your cloud scores, streak, and profile data will be permanently deleted with your account.',
      deleteAccount: 'Delete my account',
      deleteConfirmText: 'This cannot be undone. Are you sure you want to permanently delete your account and cloud data?',
      cancel: 'Cancel',
      deleteForever: 'Delete permanently',
      deleteError: 'The account could not be deleted. Check your internet connection and try again.',
      guestTitle: 'Keep your progress with you',
      guestText: 'Sign in with your email or create a free account to protect your scores and streak.',
      emailLabel: 'Email',
      emailPlaceholder: 'name@example.com',
      magicLinkMethod: 'Email link',
      passwordMethod: 'Password',
      magicLinkHelp: 'No password needed. Tap the secure link sent to your email.',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Enter your password',
      passwordHelp: 'For accounts that already have a password.',
      passwordContinue: 'Sign in with password',
      passwordRequired: 'Enter your password.',
      invalidCredentials: 'The email address or password is incorrect.',
      continue: 'Sign in / Create account',
      linkSent: 'Link sent. Check your email inbox.',
      emailRateLimit: 'Too many sign-in emails were requested. Please try again in about an hour.',
      invalidEmail: 'Enter a valid email address.',
      genericError: 'The action could not be completed. Please try again.',
      security: {
        eyebrow: 'Secure sign-in',
        title: 'Security check',
        help: 'Complete the brief security check to continue.',
        loading: 'Preparing verification...',
        cancel: 'Cancel',
      },
      securityError: 'The security check could not be completed. Please try again.',
      privacy: 'You can keep playing as a guest. An account is only required for online features.',
      privacyPolicy: 'Privacy Policy',
      privacyPolicyA11y: 'Open the privacy policy',
      unavailableTitle: 'Accounts are being prepared',
      unavailableText: 'The game still works as a guest. Sign-in will become available here when Supabase is connected.',
      buttonA11y: 'Open account and profile',
      guestShort: 'Guest',
    },
    home: {
      title: 'İşlem',
      eyebrow: 'Choose a mode',
      dailyTitle: 'Daily Game',
      dailyText: 'One special puzzle each day. First completion gives a 50% score bonus and advances your streak.',
      dailyDone: 'Scored today',
      dailyReady: 'Ready today',
      dailyButton: 'Play daily',
      dailyPageTitle: 'Daily Game',
      dailyPageText: 'Choose the difficulty for today’s puzzle. Your first completion gives the daily bonus and advances your streak.',
      trainingTitle: 'Training',
      trainingText: 'Practice at your own pace. Choose a difficulty, generate puzzles, and improve your moves.',
      trainingPageTitle: 'Training',
      trainingPageText: 'Practice at your own pace. Choose a difficulty, generate puzzles, and improve your moves.',
      trainingDifficulty: 'Difficulty',
      weeklyTitle: 'Weekly Challenge',
      weeklyText: 'Solve a special puzzle that refreshes once a week. First completion counts toward league score and unlocks a badge.',
      weeklyPageTitle: 'Weekly Challenge',
      weeklyPageText: 'This puzzle refreshes once a week. Your first completion of the week gives points, unlocks the weekly badge, and counts on your league board.',
      weeklyDone: 'Completed this week',
      weeklyReady: 'This week’s puzzle is ready',
      weeklyButton: 'Play weekly puzzle',
      challengeTitle: 'Challenge',
      challengeText: 'Race friends against the clock.',
      challengePageTitle: 'Challenge',
      challengePageText: 'A live race system for friends or matched players is being prepared.',
      challengeStatusTitle: 'In development',
      challengeStatusText: 'Room creation, friend invites, and live races will live here. For now, this mode is kept separate.',
      challengeDone: 'Scored this week',
      challengeReady: 'Weekly ready',
      challengeButton: 'Coming soon',
      roomTitle: 'Room system',
      roomCreate: 'Create room',
      roomSearch: 'Find rival',
      roomCode: 'Room code',
      roomWaiting: 'Room ready. Send the code to a friend or wait for a searching player.',
      roomMatched: (name) => `${name} joined. You can start the race.`,
      roomStart: 'Start race',
      roomReset: 'Close room',
      weeklyStart: 'Play weekly puzzle',
      tutorialTitle: 'Tutorial',
      tutorialText: 'Learn dragging, the operation dial, and result numbers step by step in the example mode.',
      tutorialButton: 'Open tutorial',
      back: 'Back',
      badgesTitle: 'Badges',
      statsTitle: 'Stats',
      badgesProgress: (earned, total) => `${earned}/${total} unlocked`,
      badgeUnlocked: 'Unlocked',
      badgeLocked: 'Locked',
      streak: 'Streak',
      weekly: 'Week score',
      league: 'League',
      best: 'Best',
    },
    completion: {
      title: 'Puzzle completed',
      score: 'Score',
      moves: 'Moves',
      targets: 'Targets',
      streak: 'Streak',
      league: 'League',
      newBadges: 'New badges',
      noNewBadges: 'No new badges',
      next: 'New game',
      close: 'Back to game',
    },
    badges: {
      first_win: {
        title: 'First Win',
        description: 'Complete your first puzzle.',
      },
      daily_first: {
        title: 'Daily Player',
        description: 'Complete today’s daily puzzle. Resets every day.',
      },
      weekly_first: {
        title: 'Weekly Racer',
        description: 'Complete a weekly challenge.',
      },
      streak_3: {
        title: 'Three Days',
        description: 'Build a 3-day streak.',
      },
      streak_7: {
        title: 'Weekly Streak',
        description: 'Build a 7-day streak.',
      },
      streak_14: {
        title: 'Two Weeks',
        description: 'Build a 14-day streak.',
      },
      perfect: {
        title: 'Ideal Solve',
        description: 'Finish a puzzle within the ideal move count.',
      },
      games_5: {
        title: 'Warm Up',
        description: 'Complete 5 puzzles.',
      },
      games_20: {
        title: 'Habit',
        description: 'Complete 20 puzzles.',
      },
      targets_50: {
        title: 'Target Hunter',
        description: 'Solve 50 targets.',
      },
      score_1000: {
        title: 'One Thousand',
        description: 'Reach 1000 total points.',
      },
      score_5000: {
        title: 'Score Hunter',
        description: 'Reach 5000 total points.',
      },
    },
    leagues: {
      bronze: 'Bronze',
      silver: 'Silver',
      gold: 'Gold',
      diamond: 'Diamond',
      mastery: 'Mastery',
    },
    leaderboard: {
      title: 'Weekly league',
      week: 'This week',
      rivals: ['Ava', 'Mert', 'Ella', 'Deni', 'Can', 'Lara'],
    },
  },
};

function getDeviceLanguage() {
  const languageCode = getLocales()[0]?.languageCode;
  return languageCode === 'tr' ? 'tr' : 'en';
}

export default function App() {
  const { height, width } = useWindowDimensions();
  const [language] = useState(getDeviceLanguage);
  const t = STRINGS[language];
  const [game, setGame] = useState(() => createGame('paper', null, t));
  const [undoStack, setUndoStack] = useState([]);
  const [bestScores, setBestScores] = useState({});
  const [dragState, setDragState] = useState(null);
  const [operation, setOperation] = useState(null);
  const [operationError, setOperationError] = useState('');
  const [hint, setHint] = useState(null);
  const [progress, setProgress] = useState(DEFAULT_PROGRESS);
  const [homeVisible, setHomeVisible] = useState(true);
  const [homePage, setHomePage] = useState('home');
  const [challengeRoom, setChallengeRoom] = useState(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [streakVisible, setStreakVisible] = useState(false);
  const [accountVisible, setAccountVisible] = useState(false);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [completionSummary, setCompletionSummary] = useState(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hintUseCount, setHintUseCount] = useState(0);
  const tileRefs = useRef({});
  const rootRef = useRef(null);
  const rootOffsetRef = useRef({ x: 0, y: 0 });
  const dragStateRef = useRef(null);
  const operationLockRef = useRef(false);
  const timerStartRef = useRef(null);

  const metrics = useMemo(
    () => getResponsiveMetrics(width, height, game.boardSize),
    [width, height, game.boardSize],
  );
  const score = useMemo(() => calculateScore(game), [game]);
  const givenNumbers = game.bank.filter((number) => number.kind === 'given');
  const resultNumbers = game.bank.filter((number) => number.kind === 'result');
  const resultTileSize = getAdaptiveResultTileSize(metrics, resultNumbers.length);
  const recentHistory = game.history.slice(-metrics.historyCount).reverse();
  const hintedNumberIds = hint?.ids || [];
  const firstOperationNumber = operation ? findNumber(game, operation.aId) : null;
  const secondOperationNumber = operation ? findNumber(game, operation.bId) : null;
  const playSound = useGameAudio(soundEnabled);
  const elapsedTimeText = formatElapsedTime(elapsedSeconds);
  const tutorialStepCount = t.tutorial.length;
  const todayKey = getDateKey();
  const weekKey = getWeekKey();
  const todayDone = Boolean(progress.completedStreakDates[todayKey]);
  const weeklyDone = Boolean(progress.completedWeeklyKeys[weekKey]);
  const weeklyScore = progress.weeklyScores[weekKey] || 0;
  const currentLeague = getLeagueForScore(weeklyScore);
  const weeklyLeaderboard = useMemo(
    () => makeWeeklyLeaderboard(weeklyScore, weekKey, t),
    [t, weekKey, weeklyScore],
  );

  useEffect(() => {
    loadBestScores().then(setBestScores);
    flushQueuedGameResults().catch(() => {
      // Cloud sync should never block app startup.
    });
  }, []);

  useEffect(() => {
    let active = true;

    getCurrentSession()
      .then((currentSession) => {
        if (active) {
          setSession(currentSession);
          setAuthLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setAuthLoading(false);
        }
      });

    const unsubscribeAuth = subscribeToAuthChanges((nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthLoading(false);
      }
    });

    const processAuthUrl = (url) => {
      handleAuthCallback(url)
        .then((nextSession) => {
          if (active && nextSession) {
            setSession(nextSession);
          }
        })
        .catch(() => {
          // The account panel remains available for a fresh sign-in attempt.
        });
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          processAuthUrl(url);
        }
      })
      .catch(() => {});
    const linkSubscription = Linking.addEventListener('url', ({ url }) => processAuthUrl(url));

    return () => {
      active = false;
      unsubscribeAuth();
      linkSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (authLoading) {
      return undefined;
    }

    let active = true;
    const userId = session?.user?.id || null;

    setProgress(normalizeProgress(DEFAULT_PROGRESS));
    loadProgress(userId).then(async (storedProgress) => {
      let nextProgress = storedProgress;

      if (userId) {
        try {
          const cloudProgress = await loadPlayerCloudProgress(userId, getWeekKey());
          nextProgress = mergeProgressWithCloud(storedProgress, cloudProgress);
          await saveProgress(nextProgress, userId);
        } catch {
          // The account can keep using its last local snapshot while offline.
        }
      }

      if (active) {
        setProgress(nextProgress);
      }
    });

    return () => {
      active = false;
    };
  }, [authLoading, session?.user?.id]);

  useEffect(() => {
    let timeoutId;

    const refreshStreak = () => {
      setProgress((currentProgress) => normalizeProgress(currentProgress));
    };
    const scheduleNextDayRefresh = () => {
      timeoutId = setTimeout(() => {
        refreshStreak();
        scheduleNextDayRefresh();
      }, getMillisecondsUntilNextDay());
    };

    scheduleNextDayRefresh();
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      flushQueuedGameResults().catch(() => {
        // A later game or app launch will retry queued results.
      });
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (game.difficulty !== 'paper') {
      setTutorialStep(tutorialStepCount);
    }
  }, [game.difficulty, tutorialStepCount]);

  useEffect(() => {
    if (operation) {
      operationLockRef.current = false;
    }
  }, [operation]);

  useEffect(() => {
    if (homeVisible || game.complete) {
      return undefined;
    }

    if (!timerStartRef.current) {
      timerStartRef.current = Date.now();
    }

    const updateElapsed = () => {
      setElapsedSeconds(getElapsedSeconds(timerStartRef.current));
    };
    updateElapsed();
    const intervalId = setInterval(updateElapsed, 1000);

    return () => clearInterval(intervalId);
  }, [game.complete, homeVisible]);

  const tutorialVisible = game.difficulty === 'paper' && tutorialStep < tutorialStepCount;

  const measureRoot = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      rootOffsetRef.current = { x, y };
    });
  }, []);

  const registerTile = useCallback((id, node) => {
    if (node) {
      tileRefs.current[id] = node;
      return;
    }
    delete tileRefs.current[id];
  }, []);

  const startNewGame = useCallback((difficulty = game.difficulty, keepSamePuzzle = false) => {
    timerStartRef.current = Date.now();
    setElapsedSeconds(0);
    setOperation(null);
    setOperationError('');
    setHint(null);
    setDragState(null);
    dragStateRef.current = null;
    setCompletionSummary(null);
    setHintUseCount(0);
    setSettingsVisible(false);
    setHomeVisible(false);
    playSound('tap');
    setTutorialStep(difficulty === 'paper' ? 0 : tutorialStepCount);
    setUndoStack([]);
    setGame((currentGame) =>
      createGame(difficulty, keepSamePuzzle ? currentGame.initialPuzzle : null, t, {
        challengeKey: keepSamePuzzle ? currentGame.challengeKey : null,
        mode: keepSamePuzzle ? currentGame.mode : MODE_NORMAL,
      }),
    );
  }, [game.difficulty, playSound, t, tutorialStepCount]);

  const startDailyGame = useCallback((difficulty = 'medium') => {
    timerStartRef.current = Date.now();
    setElapsedSeconds(0);
    setOperation(null);
    setOperationError('');
    setHint(null);
    setDragState(null);
    dragStateRef.current = null;
    setCompletionSummary(null);
    setHintUseCount(0);
    setSettingsVisible(false);
    setHomeVisible(false);
    playSound('tap');
    setTutorialStep(tutorialStepCount);
    setUndoStack([]);
    setGame(createGame(difficulty, makeDailyPuzzle(todayKey, difficulty), t, {
      challengeKey: todayKey,
      mode: MODE_DAILY,
    }));
  }, [playSound, t, todayKey, tutorialStepCount]);

  const startWeeklyGame = useCallback(() => {
    timerStartRef.current = Date.now();
    setElapsedSeconds(0);
    setOperation(null);
    setOperationError('');
    setHint(null);
    setDragState(null);
    dragStateRef.current = null;
    setCompletionSummary(null);
    setHintUseCount(0);
    setSettingsVisible(false);
    setHomeVisible(false);
    playSound('tap');
    setTutorialStep(tutorialStepCount);
    setUndoStack([]);
    setGame(createGame('weekly', makeWeeklyPuzzle(weekKey), t, {
      challengeKey: weekKey,
      mode: MODE_WEEKLY,
    }));
  }, [playSound, t, tutorialStepCount, weekKey]);

  const advanceTutorial = useCallback(() => {
    playSound('tap');
    setTutorialStep((currentStep) => Math.min(currentStep + 1, tutorialStepCount));
  }, [playSound, tutorialStepCount]);

  const clearSelection = useCallback(() => {
    setOperation(null);
    setOperationError('');
    setHint(null);
    setDragState(null);
    dragStateRef.current = null;
    playSound('tap');
    setGame((currentGame) => ({
      ...currentGame,
      message: t.messages.selectionCleared,
    }));
  }, [playSound, t]);

  const undo = useCallback(() => {
    setUndoStack((currentStack) => {
      if (currentStack.length === 0) {
        return currentStack;
      }

      const snapshot = currentStack[currentStack.length - 1];
      setOperation(null);
      setOperationError('');
      setHint(null);
      playSound('tap');
      setGame({ ...JSON.parse(snapshot), message: t.messages.undone });
      return currentStack.slice(0, -1);
    });
  }, [playSound, t]);

  const showHint = useCallback(() => {
    if (game.complete) {
      playSound('error');
      return;
    }

    const candidates = getHintCandidates(game);
    if (candidates.length === 0) {
      setHint(null);
      setOperation(null);
      setOperationError('');
      setDragState(null);
      dragStateRef.current = null;
      playSound('error');
      setGame((currentGame) => ({
        ...currentGame,
        message: t.messages.hintUnavailable,
      }));
      return;
    }

    const nextCandidates =
      hint?.key && candidates.length > 1
        ? candidates.filter((candidate) => candidate.key !== hint.key)
        : candidates;
    const nextHint = randomItem(nextCandidates.length > 0 ? nextCandidates : candidates);

    setHint(nextHint);
    setHintUseCount((currentCount) => currentCount + 1);
    setOperation(null);
    setOperationError('');
    setDragState(null);
    dragStateRef.current = null;
    playSound('tap');
    setGame((currentGame) => ({
      ...currentGame,
      message: t.messages.hintReady,
    }));
  }, [game, hint?.key, playSound, t]);

  const updateDragPosition = useCallback((number, event) => {
    const pageX = event.nativeEvent.pageX;
    const pageY = event.nativeEvent.pageY;
    const nextDragState = {
      id: number.id,
      value: number.value,
      pageX,
      pageY,
      localX: pageX - rootOffsetRef.current.x,
      localY: pageY - rootOffsetRef.current.y,
      size: number.kind === 'given' ? metrics.numberTileSize : resultTileSize,
    };

    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  }, [metrics.numberTileSize, resultTileSize]);

  const handleDragStart = useCallback((number, event) => {
    if (game.complete || operation) {
      return;
    }

    setHint(null);
    measureRoot();
    updateDragPosition(number, event);
    playSound('pick');
    setGame((currentGame) => ({
      ...currentGame,
      message: t.messages.dragToAnother(number.value),
    }));
  }, [game.complete, measureRoot, operation, playSound, t, updateDragPosition]);

  const handleDragMove = useCallback((number, event) => {
    if (!dragStateRef.current) {
      return;
    }
    updateDragPosition(number, event);
  }, [updateDragPosition]);

  const handleDragEnd = useCallback(async (number, event) => {
    const fallback = dragStateRef.current;
    if (!fallback) {
      return;
    }

    const pageX = event.nativeEvent.pageX || fallback?.pageX || 0;
    const pageY = event.nativeEvent.pageY || fallback?.pageY || 0;

    setDragState(null);
    dragStateRef.current = null;

    const target = await findDropTarget(tileRefs.current, game.bank, number.id, pageX, pageY);
    if (!target) {
      playSound('error');
      setGame((currentGame) => ({
        ...currentGame,
        message: t.messages.dropOnNumber,
      }));
      return;
    }

    playSound('drop');
    setOperation({ aId: number.id, bId: target.id });
    setOperationError('');
    setGame((currentGame) => ({
      ...currentGame,
      message: t.messages.chooseOperation(number.value, target.value),
    }));
  }, [game.bank, playSound, t]);

  const selectOperation = useCallback((op) => {
    if (!operation || operationLockRef.current) {
      return;
    }
    operationLockRef.current = true;

    const a = findNumber(game, operation.aId);
    const b = findNumber(game, operation.bId);
    if (!a || !b) {
      operationLockRef.current = false;
      setOperation(null);
      return;
    }

    const result = applyOperation(a.value, b.value, op, t);
    if (!result.ok) {
      operationLockRef.current = false;
      playSound('error');
      setOperationError(result.message);
      return;
    }

    const resultTile = {
      id: `r-${game.idCounter}`,
      value: result.value,
      kind: 'result',
      expression: `${a.value} ${op} ${b.value}`,
    };
    const targets = game.targets.map((target) => {
      if (!target.solved && target.value === result.value) {
        return { ...target, solved: true, solvedAt: game.steps + 1 };
      }
      return target;
    });
    const hitTarget = targets.some(
      (target, index) => target.solved && !game.targets[index].solved,
    );
    const nextGame = {
      ...game,
      idCounter: game.idCounter + 1,
      bank: [...game.bank, resultTile],
      targets,
      history: [
        ...game.history,
        {
          a: a.value,
          b: b.value,
          op,
          result: result.value,
          hit: hitTarget,
        },
      ],
      steps: game.steps + 1,
      message: hitTarget ? t.messages.targetDone(result.value) : t.messages.resultAdded(result.value),
    };
    const finalGame = nextGame.targets.every((target) => target.solved)
      ? {
          ...nextGame,
          complete: true,
          message: t.messages.complete,
        }
      : nextGame;

    setUndoStack((currentStack) => [...currentStack, JSON.stringify(game)]);
    setGame(finalGame);
    setOperation(null);
    setOperationError('');
    setHint(null);
    if (finalGame.complete) {
      setElapsedSeconds(getElapsedSeconds(timerStartRef.current));
    }
    playSound(finalGame.complete ? 'complete' : hitTarget ? 'target' : 'result');

    if (finalGame.complete) {
      const finalScore = calculateScore(finalGame);
      const completion = recordGameCompletion(progress, finalGame, finalScore);
      saveBestScore(finalGame.difficulty, completion.summary.score, bestScores, setBestScores);
      setProgress(completion.progress);
      saveProgress(completion.progress, session?.user?.id || null);
      setCompletionSummary(completion.summary);
      submitGameResult(
        buildGameResultPayload({
          game: finalGame,
          score: finalScore,
          awardedScore: completion.summary.score,
          durationSeconds: getElapsedSeconds(timerStartRef.current),
          hintUsedCount: hintUseCount,
          language,
        }),
      ).catch(() => {
        // Cloud sync should never block or interrupt local gameplay.
      });
    }
  }, [bestScores, game, hintUseCount, language, operation, playSound, progress, session?.user?.id, t]);

  const swapOperationNumbers = useCallback(() => {
    setOperation((currentOperation) => {
      if (!currentOperation) {
        return currentOperation;
      }
      return { aId: currentOperation.bId, bId: currentOperation.aId };
    });
    setOperationError('');
    playSound('tap');
  }, [playSound]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((currentValue) => {
      if (!currentValue) {
        playSound('tap', true);
      }
      return !currentValue;
    });
  }, [playSound]);

  const openSettings = useCallback(() => {
    playSound('tap');
    setSettingsVisible(true);
  }, [playSound]);

  const closeSettings = useCallback(() => {
    playSound('tap');
    setSettingsVisible(false);
  }, [playSound]);

  const openStreak = useCallback(() => {
    playSound('tap');
    setStreakVisible(true);
  }, [playSound]);

  const closeStreak = useCallback(() => {
    playSound('tap');
    setStreakVisible(false);
  }, [playSound]);

  const openAccount = useCallback(() => {
    playSound('tap');
    setSettingsVisible(false);
    setAccountVisible(true);
  }, [playSound]);

  const closeAccount = useCallback(() => {
    playSound('tap');
    setAccountVisible(false);
  }, [playSound]);

  const closeCompletion = useCallback(() => {
    playSound('tap');
    setCompletionSummary(null);
  }, [playSound]);

  const openTrainingPage = useCallback(() => {
    playSound('tap');
    setHomePage('training');
  }, [playSound]);

  const openDailyPage = useCallback(() => {
    playSound('tap');
    setHomePage('daily');
  }, [playSound]);

  const openWeeklyPage = useCallback(() => {
    playSound('tap');
    setHomePage('weekly');
  }, [playSound]);

  const openChallengePage = useCallback(() => {
    playSound('tap');
    setHomePage('challenge');
  }, [playSound]);

  const openStatsPage = useCallback(() => {
    playSound('tap');
    setHomePage('stats');
  }, [playSound]);

  const showHomeMenu = useCallback(() => {
    playSound('tap');
    setHomePage('home');
  }, [playSound]);

  const createChallengeRoom = useCallback(() => {
    setChallengeRoom({
      code: makeChallengeRoomCode(),
      opponent: null,
      status: 'waiting',
    });
    playSound('tap');
  }, [playSound]);

  const findChallengeOpponent = useCallback(() => {
    const rivals = t.leaderboard.rivals;
    setChallengeRoom({
      code: makeChallengeRoomCode(),
      opponent: randomItem(rivals),
      status: 'matched',
    });
    playSound('tap');
  }, [playSound, t]);

  const resetChallengeRoom = useCallback(() => {
    setChallengeRoom(null);
    playSound('tap');
  }, [playSound]);

  const startRoomChallenge = useCallback(() => {
    setChallengeRoom((currentRoom) =>
      currentRoom
        ? {
            ...currentRoom,
            status: 'development',
          }
        : currentRoom,
    );
    playSound('tap');
  }, [playSound]);

  const showHome = useCallback(() => {
    setOperation(null);
    setOperationError('');
    setHint(null);
    setDragState(null);
    dragStateRef.current = null;
    setCompletionSummary(null);
    setSettingsVisible(false);
    setHomePage('home');
    setHomeVisible(true);
    playSound('tap');
  }, [playSound]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View
          ref={rootRef}
          onLayout={measureRoot}
          style={[
            styles.screen,
            {
              paddingHorizontal: metrics.screenPadding,
              paddingBottom: metrics.screenPadding,
              paddingTop: metrics.topPadding,
            },
          ]}
        >
        {homeVisible ? (
          <HomeScreen
            challengeRoom={challengeRoom}
            homePage={homePage}
            league={currentLeague}
            onBackHome={showHomeMenu}
            onCreateChallengeRoom={createChallengeRoom}
            onFindChallengeOpponent={findChallengeOpponent}
            onOpenChallenge={openChallengePage}
            onOpenAccount={openAccount}
            onOpenDaily={openDailyPage}
            onOpenSettings={openSettings}
            onOpenStreak={openStreak}
            onOpenStats={openStatsPage}
            onOpenTraining={openTrainingPage}
            onOpenWeekly={openWeeklyPage}
            onResetChallengeRoom={resetChallengeRoom}
            onStartChallengeRace={startRoomChallenge}
            onStartDaily={startDailyGame}
            onStartPractice={(difficulty) => startNewGame(difficulty)}
            onStartTutorial={() => startNewGame('paper')}
            onStartWeekly={startWeeklyGame}
            progress={progress}
            session={session}
            strings={t}
            todayDone={todayDone}
            weekKey={weekKey}
            weeklyDone={weeklyDone}
            weeklyScore={weeklyScore}
          />
        ) : (
          <>
        <View style={[styles.topBar, { gap: metrics.actionGap, marginBottom: metrics.blockGap }]}>
          <View style={styles.titleBlock}>
            <Pressable
              accessibilityLabel={t.actions.homeA11y}
              accessibilityRole="button"
              onPress={showHome}
              style={({ pressed }) => [styles.homeBackButton, pressed && styles.pressed]}
            >
              <Text style={styles.homeBackIcon}>‹</Text>
              <Text style={styles.homeBackText}>{t.home.back}</Text>
            </Pressable>
            <Text style={styles.eyebrow}>{t.eyebrow}</Text>
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                { fontSize: metrics.titleSize, lineHeight: metrics.titleLineHeight },
              ]}
            >
              {t.appName}
            </Text>
          </View>
          <View style={[styles.topActions, { gap: metrics.actionGap }]}>
            <IconButton
              accessibilityLabel={t.actions.hintA11y}
              active={Boolean(hint)}
              icon="💡"
              label={t.actions.hint}
              metrics={metrics}
              onPress={showHint}
            />
            <IconButton
              accessibilityLabel={t.actions.settingsA11y}
              icon="⚙"
              label={t.actions.settings}
              metrics={metrics}
              onPress={openSettings}
            />
            <IconButton
              accessibilityLabel={t.actions.resetA11y}
              icon="↺"
              label={t.actions.reset}
              metrics={metrics}
              onPress={() => startNewGame(game.difficulty, true)}
            />
            <IconButton
              accessibilityLabel={t.actions.newGameA11y}
              icon="+"
              label={t.actions.newGame}
              metrics={metrics}
              primary
              onPress={() => (game.mode === MODE_WEEKLY ? startWeeklyGame() : startNewGame(game.difficulty))}
            />
          </View>
        </View>

        <View style={[styles.statsRow, { gap: metrics.blockGap, marginBottom: metrics.blockGap }]}>
          <Stat label={t.stats.score} metrics={metrics} value={score} />
          <Stat label={t.stats.moves} metrics={metrics} value={`${game.steps}/${game.par}`} />
          <Stat
            compactValue={elapsedSeconds >= 3600}
            label={t.stats.time}
            metrics={metrics}
            value={elapsedTimeText}
          />
        </View>

        <View style={[styles.gameArea, { gap: metrics.gameGap }, metrics.isWide && styles.gameAreaWide]}>
          <View style={[styles.boardPane, metrics.isWide && { width: metrics.boardSide + 28 }]}>
            <View style={[styles.sectionHeader, { marginBottom: metrics.blockGap }]}>
              <View>
                {game.mode !== MODE_WEEKLY ? (
                  <Text style={styles.eyebrow}>{t.gameNames[game.difficulty]}</Text>
                ) : null}
                <Text style={[styles.sectionTitle, { fontSize: metrics.sectionTitleSize }]}>
                  {t.board.title}
                </Text>
              </View>
            </View>

            <TargetBoard game={game} metrics={metrics} strings={t} />
          </View>

          <View style={[styles.playPane, { gap: metrics.playGap }]}>
            <View style={[styles.messageBar, game.complete && styles.successMessage]}>
              <Text
                numberOfLines={metrics.isShort ? 1 : 2}
                style={[styles.messageText, game.complete && styles.successText]}
              >
                {game.message}
              </Text>
            </View>

            <View style={[styles.numberPanel, { padding: metrics.panelPadding }]}>
              <View style={styles.rackHeader}>
                <Text style={styles.rackTitle}>{t.racks.given}</Text>
                <Text style={styles.rackHint}>{t.racks.drag}</Text>
              </View>
              <View
                style={[
                  styles.numberRack,
                  { gap: metrics.numberGap, marginBottom: metrics.numberSectionGap },
                ]}
              >
                {givenNumbers.map((number) => (
                  <NumberTile
                    disabled={Boolean(operation) || game.complete}
                    hinted={hintedNumberIds.includes(number.id)}
                    key={number.id}
                    number={number}
                    onDragEnd={handleDragEnd}
                    onDragMove={handleDragMove}
                    onDragStart={handleDragStart}
                    registerTile={registerTile}
                    size={metrics.numberTileSize}
                    strings={t}
                  />
                ))}
              </View>

              <View style={styles.rackHeader}>
                <Text style={styles.rackTitle}>{t.racks.results}</Text>
                <Text style={styles.rackHint}>{resultNumbers.length}</Text>
              </View>
              <View style={styles.resultRackFrame}>
                {resultNumbers.length > 0 ? (
                  <View style={[styles.resultRackContent, { gap: metrics.resultGap }]}>
                    {resultNumbers.map((number) => (
                      <NumberTile
                        compact
                        disabled={Boolean(operation) || game.complete}
                        hinted={hintedNumberIds.includes(number.id)}
                        key={number.id}
                        number={number}
                        onDragEnd={handleDragEnd}
                        onDragMove={handleDragMove}
                        onDragStart={handleDragStart}
                        registerTile={registerTile}
                        size={resultTileSize}
                        strings={t}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>{t.racks.emptyResults}</Text>
                )}
              </View>
            </View>

            <View style={[styles.bottomPanel, { padding: metrics.panelPadding }]}>
              <View style={styles.historyBlock}>
                <Text style={styles.bottomTitle}>{t.history.title}</Text>
                {recentHistory.length > 0 ? (
                  recentHistory.map((item, index) => (
                    <Text key={`${item.result}-${index}`} numberOfLines={1} style={styles.historyText}>
                      {item.a} {item.op} {item.b} = {item.result}
                      <Text style={item.hit ? styles.historyHit : styles.historyMiss}>
                        {item.hit ? t.history.hit : t.history.miss}
                      </Text>
                    </Text>
                  ))
                ) : (
                  <Text style={styles.emptyText}>{t.history.empty}</Text>
                )}
              </View>
              <Pressable
                accessibilityLabel={t.actions.undoA11y}
                accessibilityRole="button"
                accessibilityState={{ disabled: undoStack.length === 0 }}
                disabled={undoStack.length === 0}
                onPress={undo}
                style={({ pressed }) => [
                  styles.undoButton,
                  undoStack.length === 0 && styles.disabledButton,
                  pressed && undoStack.length > 0 && styles.pressed,
                ]}
              >
                <Text style={styles.undoText}>{t.actions.undo}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <OperationDial
          a={firstOperationNumber}
          b={secondOperationNumber}
          error={operationError}
          onCancel={clearSelection}
          onSelect={selectOperation}
          onSwap={swapOperationNumbers}
          strings={t}
          visible={Boolean(operation)}
        />

        {dragState ? <DragGhost dragState={dragState} /> : null}
        <TutorialOverlay
          metrics={metrics}
          onAdvance={advanceTutorial}
          step={tutorialStep}
          strings={t}
          visible={tutorialVisible}
        />
        <CompletionPanel
          onClose={closeCompletion}
          onNext={() => (game.mode === MODE_WEEKLY ? startWeeklyGame() : startNewGame(game.difficulty))}
          strings={t}
          summary={completionSummary}
        />
          </>
        )}
        <SettingsPanel
          currentDifficulty={game.difficulty}
          leaderboard={weeklyLeaderboard}
          league={currentLeague}
          onClose={closeSettings}
          onGoHome={showHome}
          onOpenAccount={openAccount}
          onSelectDifficulty={(difficulty) => startNewGame(difficulty)}
          onToggleSound={toggleSound}
          progress={progress}
          session={session}
          soundEnabled={soundEnabled}
          strings={t}
          visible={settingsVisible}
          weekKey={weekKey}
          weeklyScore={weeklyScore}
        />
        <StreakPanel
          onClose={closeStreak}
          progress={progress}
          strings={t}
          todayDone={todayDone}
          visible={streakVisible}
        />
        <AccountPanel
          configured={isSupabaseConfigured}
          language={language}
          loading={authLoading}
          onClose={closeAccount}
          session={session}
          strings={t.account}
          visible={accountVisible}
        />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function getResponsiveMetrics(width, height, boardSize) {
  const isWide = width >= 760;
  const isTinyPhone = !isWide && height < 760;
  const isShort = !isWide && height < 860;
  const compactUi = !isWide;
  const screenPadding = isWide ? 24 : isTinyPhone ? 10 : 12;
  const topPadding = isWide ? 12 : 4;
  const availableWidth = width - screenPadding * 2;
  const boardLimitByHeight = isWide ? height - 230 : height * (isTinyPhone ? 0.25 : 0.3);
  const boardMax = isWide ? 430 : boardSize === 4 ? (isShort ? 252 : 286) : (isShort ? 270 : 310);
  const boardSide = Math.floor(
    Math.max(
      boardSize === 4 ? (isTinyPhone ? 206 : 224) : (isTinyPhone ? 214 : 232),
      Math.min(availableWidth, boardMax, Math.max(210, boardLimitByHeight)),
    ),
  );
  const boardGap = boardSize === 4 ? (isShort ? 5 : 7) : (isShort ? 6 : 8);
  const boardPadding = boardSize === 4 ? 8 : 9;
  const cellSide =
    (boardSide - boardPadding * 2 - boardGap * (boardSize - 1)) / boardSize;

  return {
    boardGap,
    boardPadding,
    boardSide,
    cellSide,
    actionButtonMinWidth: isWide ? 58 : isTinyPhone ? 44 : 50,
    actionButtonSize: isWide ? 50 : isTinyPhone ? 42 : 46,
    actionGap: isWide ? 8 : 6,
    blockGap: isWide ? 8 : isTinyPhone ? 5 : 6,
    compactUi,
    gameGap: isWide ? 14 : isTinyPhone ? 6 : 8,
    historyCount: isWide ? 3 : 2,
    isShort,
    isTinyPhone,
    isWide,
    levelHeight: isWide ? 38 : isTinyPhone ? 30 : 34,
    numberGap: isWide ? 8 : isTinyPhone ? 5 : 6,
    numberSectionGap: isWide ? 8 : isTinyPhone ? 4 : 6,
    numberTileSize: isWide ? 72 : isTinyPhone ? 44 : isShort ? 50 : 54,
    panelPadding: isWide ? 10 : isTinyPhone ? 7 : 8,
    playGap: isWide ? 8 : isTinyPhone ? 5 : 6,
    resultGap: isWide ? 7 : isTinyPhone ? 4 : 5,
    resultTileSize: isWide ? 62 : isTinyPhone ? 36 : isShort ? 40 : 44,
    sectionTitleSize: isWide ? 21 : isTinyPhone ? 18 : 19,
    screenPadding,
    statPaddingHorizontal: isWide ? 10 : 8,
    statPaddingVertical: isWide ? 8 : isTinyPhone ? 5 : 6,
    titleLineHeight: isWide ? 36 : isTinyPhone ? 28 : 31,
    titleSize: isWide ? 34 : isTinyPhone ? 27 : 30,
    topPadding,
  };
}

function getAdaptiveResultTileSize(metrics, resultCount) {
  if (metrics.isWide) {
    if (resultCount > 30) {
      return 42;
    }
    if (resultCount > 18) {
      return 50;
    }
    return metrics.resultTileSize;
  }

  if (resultCount > 34) {
    return metrics.isTinyPhone ? 24 : 26;
  }
  if (resultCount > 24) {
    return metrics.isTinyPhone ? 27 : 30;
  }
  if (resultCount > 14) {
    return metrics.isTinyPhone ? 31 : 34;
  }

  return metrics.resultTileSize;
}

function getElapsedSeconds(startedAt) {
  if (!startedAt) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function formatElapsedTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const seconds = safeSeconds % 60;
  const minutes = Math.floor(safeSeconds / 60) % 60;
  const hours = Math.floor(safeSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${padTime(minutes)}:${padTime(seconds)}`;
  }

  return `${padTime(minutes)}:${padTime(seconds)}`;
}

function padTime(value) {
  return String(value).padStart(2, '0');
}

function useGameAudio(enabled) {
  const completePlayer = useAudioPlayer(require('./assets/sounds/complete.wav'));
  const pickPlayer = useAudioPlayer(require('./assets/sounds/pick.wav'));
  const dropPlayer = useAudioPlayer(require('./assets/sounds/drop.wav'));
  const resultPlayer = useAudioPlayer(require('./assets/sounds/result.wav'));
  const targetPlayer = useAudioPlayer(require('./assets/sounds/target.wav'));
  const errorPlayer = useAudioPlayer(require('./assets/sounds/error.wav'));
  const tapPlayer = useAudioPlayer(require('./assets/sounds/tap.wav'));
  const activePlayerRef = useRef(null);
  const lastSoundRef = useRef({ at: 0, name: null });
  const playVersionRef = useRef(0);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
    });
  }, []);

  return useCallback(
    (name, force = false) => {
      if (!enabled && !force) {
        return;
      }

      const players = {
        complete: completePlayer,
        drop: dropPlayer,
        error: errorPlayer,
        pick: pickPlayer,
        result: resultPlayer,
        tap: tapPlayer,
        target: targetPlayer,
      };
      const player = players[name];
      if (!player) {
        return;
      }

      const now = Date.now();
      if (lastSoundRef.current.name === name && now - lastSoundRef.current.at < SOUND_DEBOUNCE_MS) {
        return;
      }
      lastSoundRef.current = { at: now, name };
      playVersionRef.current += 1;
      const playVersion = playVersionRef.current;

      try {
        if (activePlayerRef.current && activePlayerRef.current !== player) {
          activePlayerRef.current.pause?.();
          activePlayerRef.current.seekTo?.(0);
        }

        player.pause?.();
        const seekResult = player.seekTo?.(0);
        const startPlayback = () => {
          if (playVersion !== playVersionRef.current) {
            return;
          }
          activePlayerRef.current = player;
          player.play?.();
        };

        if (seekResult?.then) {
          seekResult.then(startPlayback).catch(startPlayback);
        } else {
          startPlayback();
        }
      } catch {
        // Sound should never block gameplay.
      }
    },
    [completePlayer, dropPlayer, enabled, errorPlayer, pickPlayer, resultPlayer, tapPlayer, targetPlayer],
  );
}

function TargetBoard({ game, metrics, strings }) {
  return (
    <View
      style={[
        styles.board,
        {
          width: metrics.boardSide,
          padding: metrics.boardPadding,
          gap: metrics.boardGap,
        },
      ]}
    >
      {Array.from({ length: game.boardSize * game.boardSize }, (_, index) => {
        const row = Math.floor(index / game.boardSize);
        const col = index % game.boardSize;
        const target = game.targets.find((item) => item.row === row && item.col === col);

        return (
          <View
            key={`${row}-${col}`}
            style={[
              styles.boardCell,
              { height: metrics.cellSide, width: metrics.cellSide },
              target && styles.targetCell,
              target?.solved && styles.solvedCell,
            ]}
          >
            {target ? (
              <>
                <Text
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  style={[styles.targetValue, target.solved && styles.solvedText]}
                >
                  {target.value}
                </Text>
                <Text style={[styles.targetStatus, target.solved && styles.solvedText]}>
                  {target.solved ? strings.board.solved : strings.board.target}
                </Text>
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Stat({ compactValue = false, label, metrics, value }) {
  const valueFontSize = compactValue
    ? metrics.isTinyPhone
      ? 14
      : 16
    : metrics.isTinyPhone
      ? 18
      : 20;

  return (
    <View
      style={[
        styles.statCard,
        {
          paddingHorizontal: metrics.statPaddingHorizontal,
          paddingVertical: metrics.statPaddingVertical,
        },
      ]}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        numberOfLines={1}
        style={[
          styles.statValue,
          { fontSize: valueFontSize, marginTop: metrics.isTinyPhone ? 0 : 1 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function IconButton({
  accessibilityLabel,
  active = false,
  icon,
  label,
  metrics,
  onPress,
  primary = false,
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        active && styles.activeIconButton,
        primary && styles.primaryIconButton,
        pressed && styles.pressed,
        {
          height: metrics.actionButtonSize,
          minWidth: metrics.actionButtonMinWidth,
          paddingHorizontal: metrics.isTinyPhone ? 5 : 8,
        },
      ]}
    >
      <Text
        style={[
          styles.iconText,
          { fontSize: metrics.isTinyPhone ? 18 : 21, lineHeight: metrics.isTinyPhone ? 19 : 22 },
          active && styles.activeIconText,
          primary && styles.primaryIconText,
        ]}
      >
        {icon}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.iconLabel,
          { fontSize: metrics.isTinyPhone ? 9 : 10 },
          active && styles.activeIconText,
          primary && styles.primaryIconText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StreakBadge({ compact = false, completed, count, onPress, strings }) {
  return (
    <Pressable
      accessibilityLabel={`${strings.status.streak}: ${count}`}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={[
        styles.streakBadge,
        completed ? styles.streakBadgeComplete : styles.streakBadgeIdle,
        compact && styles.streakBadgeCompact,
      ]}
    >
      {completed ? <AnimatedGlow style={styles.streakBadgeGlow} /> : null}
      <FireIcon active={completed} compact={compact} />
      <Text style={[styles.streakBadgeValue, completed && styles.streakBadgeValueComplete]}>{count}</Text>
    </Pressable>
  );
}

function FireIcon({ active = false, compact = false, large = false }) {
  const motion = useRef(new Animated.Value(0)).current;
  const shouldMove = active || large;

  useEffect(() => {
    if (!shouldMove) {
      motion.setValue(0);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          duration: large ? 760 : 620,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          duration: large ? 820 : 680,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [large, motion, shouldMove]);

  const animatedStyle = shouldMove
    ? {
        opacity: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [active ? 0.94 : 0.72, active ? 1 : 0.9],
        }),
        transform: [
          {
            translateY: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [0, large ? -5 : -2],
            }),
          },
          {
            scale: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [1, large ? 1.06 : 1.04],
            }),
          },
        ],
      }
    : null;

  return (
    <Animated.View
      style={[
        styles.fireIcon,
        compact && styles.fireIconCompact,
        large && styles.fireIconLarge,
        animatedStyle,
      ]}
    >
      {active ? <AnimatedGlow style={[styles.fireGlow, large && styles.fireGlowLarge]} /> : null}
      <View
        style={[
          styles.fireOuter,
          active ? styles.fireOuterActive : styles.fireOuterIdle,
          compact && styles.fireOuterCompact,
          large && styles.fireOuterLarge,
        ]}
      />
      <View
        style={[
          styles.fireSide,
          active ? styles.fireSideActive : styles.fireSideIdle,
          compact && styles.fireSideCompact,
          large && styles.fireSideLarge,
        ]}
      />
      <View
        style={[
          styles.fireCore,
          active ? styles.fireCoreActive : styles.fireCoreIdle,
          compact && styles.fireCoreCompact,
          large && styles.fireCoreLarge,
        ]}
      />
    </Animated.View>
  );
}

function AnimatedGlow({ style }) {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [glow]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          opacity: glow.interpolate({
            inputRange: [0, 1],
            outputRange: [0.18, 0.55],
          }),
          transform: [
            {
              scale: glow.interpolate({
                inputRange: [0, 1],
                outputRange: [0.86, 1.18],
              }),
            },
          ],
        },
      ]}
    />
  );
}

function HomeScreen({
  challengeRoom,
  homePage,
  league,
  onBackHome,
  onCreateChallengeRoom,
  onFindChallengeOpponent,
  onOpenAccount,
  onOpenChallenge,
  onOpenDaily,
  onOpenSettings,
  onOpenStreak,
  onOpenStats,
  onOpenTraining,
  onOpenWeekly,
  onResetChallengeRoom,
  onStartChallengeRace,
  onStartDaily,
  onStartPractice,
  onStartTutorial,
  onStartWeekly,
  progress,
  session,
  strings,
  todayDone,
  weekKey,
  weeklyDone,
  weeklyScore,
}) {
  const trainingLevels = PLAYABLE_DIFFICULTIES;

  if (homePage === 'training') {
    return (
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <HomePageHeader
          onBack={onBackHome}
          onOpenAccount={onOpenAccount}
          onOpenStreak={onOpenStreak}
          progress={progress}
          session={session}
          strings={strings}
          title={strings.home.trainingPageTitle}
          todayDone={todayDone}
        />

        <View style={styles.modeDetailCard}>
          <Text style={styles.homeCardText}>{strings.home.trainingPageText}</Text>
          <Text style={styles.subsectionTitle}>{strings.home.trainingDifficulty}</Text>
          <View style={styles.homeLevelGrid}>
            {trainingLevels.map((difficulty) => (
              <Pressable
                accessibilityRole="button"
                key={difficulty}
                onPress={() => onStartPractice(difficulty)}
                style={({ pressed }) => [styles.homeLevelButton, pressed && styles.pressed]}
              >
                <Text style={styles.homeLevelIcon}>{difficultyIcon(difficulty)}</Text>
                <Text numberOfLines={1} style={styles.homeLevelText}>
                  {strings.difficulties[difficulty]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

  if (homePage === 'daily') {
    return (
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <HomePageHeader
          onBack={onBackHome}
          onOpenAccount={onOpenAccount}
          onOpenStreak={onOpenStreak}
          progress={progress}
          session={session}
          strings={strings}
          title={strings.home.dailyPageTitle}
          todayDone={todayDone}
        />

        <View style={styles.modeDetailCard}>
          <Text style={styles.homeCardText}>{strings.home.dailyPageText}</Text>
          <Text style={styles.subsectionTitle}>{strings.home.trainingDifficulty}</Text>
          <View style={styles.homeLevelGrid}>
            {PLAYABLE_DIFFICULTIES.map((difficulty) => (
              <Pressable
                accessibilityRole="button"
                key={difficulty}
                onPress={() => onStartDaily(difficulty)}
                style={({ pressed }) => [styles.homeLevelButton, pressed && styles.pressed]}
              >
                <Text style={styles.homeLevelIcon}>{difficultyIcon(difficulty)}</Text>
                <Text numberOfLines={1} style={styles.homeLevelText}>
                  {strings.difficulties[difficulty]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

  if (homePage === 'stats') {
    return (
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <HomePageHeader
          onBack={onBackHome}
          onOpenAccount={onOpenAccount}
          onOpenStreak={onOpenStreak}
          progress={progress}
          session={session}
          strings={strings}
          title={strings.home.statsTitle}
          todayDone={todayDone}
        />

        <View style={styles.modeDetailCard}>
          <View style={styles.statGrid}>
            <MiniStat icon="✓" label={strings.settings.gamesCompleted} value={progress.stats.gamesCompleted} />
            <MiniStat icon="Σ" label={strings.settings.totalScore} value={progress.stats.totalScore} />
            <MiniStat icon="★" label={strings.settings.bestScore} value={progress.stats.bestScore} />
            <MiniStat icon="=" label={strings.settings.totalMoves} value={progress.stats.totalMoves} />
            <MiniStat icon="S" label={strings.settings.currentStreak} value={progress.streak.current} />
            <MiniStat icon="B" label={strings.settings.bestStreak} value={progress.streak.best} />
            <MiniStat icon="W" label={strings.settings.weeklyScore} value={weeklyScore} />
            <MiniStat icon={league.icon} label={strings.status.league} value={strings.leagues[league.id]} />
          </View>
        </View>
      </ScrollView>
    );
  }

  if (homePage === 'weekly') {
    return (
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <HomePageHeader
          onBack={onBackHome}
          onOpenAccount={onOpenAccount}
          onOpenStreak={onOpenStreak}
          progress={progress}
          session={session}
          strings={strings}
          title={strings.home.weeklyPageTitle}
          todayDone={todayDone}
        />

        <View style={styles.modeDetailCard}>
          <Text style={styles.homeCardText}>{strings.home.weeklyPageText}</Text>
          <View style={styles.homeMetaRow}>
            <Text numberOfLines={1} style={styles.homeStatus}>
              {weeklyDone ? strings.home.weeklyDone : strings.home.weeklyReady}
            </Text>
            <View style={styles.homeMetaPill}>
              <Text numberOfLines={1} style={styles.homeMetaLabel}>{strings.status.weekly}</Text>
              <Text numberOfLines={1} style={styles.homeMetaValue}>{weekKey}</Text>
            </View>
            <View style={styles.homeMetaPill}>
              <Text numberOfLines={1} style={styles.homeMetaLabel}>{strings.home.weekly}</Text>
              <Text numberOfLines={1} style={styles.homeMetaValue}>{weeklyScore}</Text>
            </View>
            <View style={styles.homeMetaPill}>
              <Text numberOfLines={1} style={styles.homeMetaLabel}>{strings.home.league}</Text>
              <Text numberOfLines={1} style={styles.homeMetaValue}>{strings.leagues[league.id]}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onStartWeekly}
            style={({ pressed }) => [styles.homeButton, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.homeButtonText}>{strings.home.weeklyButton}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (homePage === 'challenge') {
    return (
      <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
        <HomePageHeader
          onBack={onBackHome}
          onOpenAccount={onOpenAccount}
          onOpenStreak={onOpenStreak}
          progress={progress}
          session={session}
          strings={strings}
          title={strings.home.challengePageTitle}
          todayDone={todayDone}
        />

        <View style={styles.modeDetailCard}>
          <Text style={styles.homeCardText}>{strings.home.challengePageText}</Text>
          <View style={styles.roomPanel}>
            <View style={styles.roomHeader}>
              <Text style={styles.roomTitle}>{strings.home.challengeStatusTitle}</Text>
              <Text style={styles.roomWeek}>{strings.home.challengeTitle}</Text>
            </View>
            <View style={styles.roomState}>
              <Text style={styles.roomLabel}>{strings.home.challengeButton}</Text>
              <Text style={styles.roomMessage}>{strings.home.challengeStatusText}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
      <View style={styles.homeTopRow}>
        <View style={styles.homeTitleBlock}>
          <Text style={styles.eyebrow}>{strings.home.eyebrow}</Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} style={styles.homeTitle}>
            {strings.home.title}
          </Text>
        </View>
        <View style={styles.homeHeaderActions}>
          <AccountButton onPress={onOpenAccount} session={session} strings={strings.account} />
          <StreakBadge
            completed={todayDone}
            count={progress.streak.current}
            onPress={onOpenStreak}
            strings={strings}
          />
        </View>
      </View>

      <View style={styles.homeModeGrid}>
        <HomeModeTile
          icon="D"
          onPress={onOpenDaily}
          title={strings.home.dailyTitle}
        />
        <HomeModeTile
          icon="A"
          onPress={onOpenTraining}
          title={strings.home.trainingTitle}
        />
        <HomeModeTile
          icon="W"
          onPress={onOpenWeekly}
          title={strings.home.weeklyTitle}
        />
        <HomeModeTile
          icon="Σ"
          onPress={onOpenStats}
          title={strings.home.statsTitle}
        />
        <HomeModeTile
          icon="?"
          onPress={onStartTutorial}
          title={strings.home.tutorialTitle}
        />
        <HomeModeTile
          icon="⚙"
          onPress={onOpenSettings}
          title={strings.actions.settings}
        />
      </View>

      <HomeBadgeList progress={progress} strings={strings} />
    </ScrollView>
  );
}

function HomePageHeader({ onBack, onOpenAccount, onOpenStreak, progress, session, strings, title, todayDone }) {
  return (
    <View style={styles.homePageHeader}>
      <View style={styles.homePageTitleBlock}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.homeBackButton, pressed && styles.pressed]}
        >
          <Text style={styles.homeBackIcon}>‹</Text>
          <Text style={styles.homeBackText}>{strings.home.back}</Text>
        </Pressable>
        <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.homeTitle}>
          {title}
        </Text>
      </View>
      <View style={styles.homeHeaderActions}>
        <AccountButton onPress={onOpenAccount} session={session} strings={strings.account} />
        <StreakBadge
          completed={todayDone}
          count={progress.streak.current}
          onPress={onOpenStreak}
          strings={strings}
        />
      </View>
    </View>
  );
}

function AccountButton({ onPress, session, strings }) {
  const label = session?.user?.email?.slice(0, 1).toUpperCase() || strings.icon;

  return (
    <Pressable
      accessibilityLabel={strings.buttonA11y}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.accountButton,
        session && styles.accountButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.accountButtonText, session && styles.accountButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function HomeModeTile({ icon, onPress, title }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.homeModeTile, pressed && styles.pressed]}
    >
      <Text style={styles.homeModeIcon}>{icon}</Text>
      <Text numberOfLines={2} style={styles.homeModeTitle}>{title}</Text>
    </Pressable>
  );
}

function HomeBadgeList({ progress, strings }) {
  const badgeRows = BADGE_DEFS.map((badge) => ({
    badge,
    unlocked: isBadgeUnlocked(badge, progress),
  }));
  const unlockedCount = badgeRows.filter((item) => item.unlocked).length;

  return (
    <View style={styles.homeBadgePanel}>
      <View style={styles.homeBadgeHeader}>
        <Text style={styles.homeBadgeTitle}>{strings.home.badgesTitle}</Text>
        <Text style={styles.homeBadgeCount}>
          {strings.home.badgesProgress(unlockedCount, badgeRows.length)}
        </Text>
      </View>
      {badgeRows.map(({ badge, unlocked }) => (
        <BadgeListItem
          badge={badge}
          key={badge.id}
          locked={!unlocked}
          strings={strings}
        />
      ))}
    </View>
  );
}

function BadgeListItem({ badge, locked, strings }) {
  const copy = strings.badges[badge.id];

  return (
    <View style={[styles.badgeListItem, locked && styles.lockedBadge]}>
      <View style={styles.badgeListIconWrap}>
        <Text style={styles.badgeListIcon}>{badge.icon}</Text>
      </View>
      <View style={styles.badgeListCopy}>
        <Text numberOfLines={1} style={styles.badgeListTitle}>{copy.title}</Text>
        <Text numberOfLines={2} style={styles.badgeListDescription}>{copy.description}</Text>
      </View>
      <Text style={styles.badgeListState}>
        {locked ? strings.home.badgeLocked : strings.home.badgeUnlocked}
      </Text>
    </View>
  );
}

function ChallengeRoomPanel({
  challengeRoom,
  league,
  onCreateChallengeRoom,
  onFindChallengeOpponent,
  onResetChallengeRoom,
  onStartChallengeRace,
  strings,
  weekKey,
  weeklyDone,
  weeklyScore,
}) {
  const hasRoom = Boolean(challengeRoom);
  const roomMessage =
    challengeRoom?.status === 'matched'
      ? strings.home.roomMatched(challengeRoom.opponent)
      : strings.home.roomWaiting;

  return (
    <View style={styles.roomPanel}>
      <View style={styles.roomHeader}>
        <Text style={styles.roomTitle}>{strings.home.roomTitle}</Text>
        <Text style={styles.roomWeek}>{weekKey}</Text>
      </View>

      {hasRoom ? (
        <View style={styles.roomState}>
          <Text style={styles.roomLabel}>{strings.home.roomCode}</Text>
          <Text style={styles.roomCode}>{challengeRoom.code}</Text>
          <Text style={styles.roomMessage}>{roomMessage}</Text>
          <View style={styles.roomActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onStartChallengeRace}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>{strings.home.roomStart}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onResetChallengeRoom}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>{strings.home.roomReset}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.roomActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onCreateChallengeRoom}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{strings.home.roomCreate}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onFindChallengeOpponent}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{strings.home.roomSearch}</Text>
        </Pressable>
      </View>

      <View style={styles.homeMetaRow}>
        <Text numberOfLines={1} style={styles.homeStatus}>
          {weeklyDone ? strings.home.challengeDone : strings.home.challengeReady}
        </Text>
        <View style={styles.homeMetaPill}>
          <Text numberOfLines={1} style={styles.homeMetaLabel}>{strings.home.weekly}</Text>
          <Text numberOfLines={1} style={styles.homeMetaValue}>{weeklyScore}</Text>
        </View>
        <View style={styles.homeMetaPill}>
          <Text numberOfLines={1} style={styles.homeMetaLabel}>{strings.home.league}</Text>
          <Text numberOfLines={1} style={styles.homeMetaValue}>{strings.leagues[league.id]}</Text>
        </View>
      </View>
    </View>
  );
}

function StreakPanel({ onClose, progress, strings, todayDone, visible }) {
  if (!visible) {
    return null;
  }

  const streakDays = getRecentStreakDays(progress, strings);

  return (
    <View style={styles.streakOverlay}>
      <View style={[styles.streakCard, todayDone && styles.streakCardActive]}>
        <View style={styles.streakHeader}>
          <Pressable
            accessibilityLabel={strings.actions.closeA11y}
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.streakCloseButton, pressed && styles.pressed]}
          >
            <Text style={styles.streakCloseText}>×</Text>
          </Pressable>
          <Text style={styles.streakTitle}>{strings.streakPage.title}</Text>
          <View style={styles.streakHeaderSpacer} />
        </View>

        <View style={styles.streakHero}>
          <FireIcon active={todayDone} large />
          <Text style={styles.streakHeroTitle}>
            {strings.streakPage.dailyTitle(progress.streak.current)}
          </Text>
          <View style={styles.streakStatsRow}>
            <MiniStat icon="S" label={strings.streakPage.current} value={progress.streak.current} />
            <MiniStat icon="B" label={strings.streakPage.best} value={progress.streak.best} />
          </View>
          <View style={styles.streakDaysRow}>
            {streakDays.map((day) => (
              <View key={day.key} style={styles.streakDayItem}>
                <Text style={styles.streakDayLabel}>{day.label}</Text>
                <View
                  style={[
                    styles.streakDayBox,
                    day.completed && styles.streakDayBoxComplete,
                    day.today && styles.streakDayBoxToday,
                  ]}
                >
                  {day.completed ? <Text style={styles.streakDayCheck}>✓</Text> : null}
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.streakTodayText}>
            {todayDone ? strings.streakPage.todayDone : strings.streakPage.todayOpen}
          </Text>
        </View>
      </View>
    </View>
  );
}

function SettingsPanel({
  currentDifficulty,
  leaderboard,
  league,
  onClose,
  onGoHome,
  onOpenAccount,
  onSelectDifficulty,
  onToggleSound,
  progress,
  session,
  soundEnabled,
  strings,
  visible,
  weekKey,
  weeklyScore,
}) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.modalOverlay}>
      <Pressable
        accessibilityLabel={strings.actions.closeA11y}
        accessibilityRole="button"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.settingsCard}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{strings.settings.title}</Text>
          <Pressable
            accessibilityLabel={strings.actions.closeA11y}
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <PanelSection title={strings.settings.game}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: soundEnabled }}
              onPress={onToggleSound}
              style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
            >
              <Text style={styles.settingIcon}>♪</Text>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>{strings.actions.sound}</Text>
                <Text style={styles.settingSubtitle}>
                  {soundEnabled ? strings.settings.soundOn : strings.settings.soundOff}
                </Text>
              </View>
              <Text style={styles.settingValue}>{soundEnabled ? 'ON' : 'OFF'}</Text>
            </Pressable>

            <Pressable
              accessibilityLabel={strings.actions.homeA11y}
              accessibilityRole="button"
              onPress={onGoHome}
              style={({ pressed }) => [styles.settingRow, styles.settingRowGap, pressed && styles.pressed]}
            >
              <Text style={styles.settingIcon}>H</Text>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>{strings.actions.home}</Text>
                <Text style={styles.settingSubtitle}>{strings.settings.homeSubtitle}</Text>
              </View>
              <Text style={styles.settingValue}>→</Text>
            </Pressable>

            <Pressable
              accessibilityLabel={strings.account.buttonA11y}
              accessibilityRole="button"
              onPress={onOpenAccount}
              style={({ pressed }) => [styles.settingRow, styles.settingRowGap, pressed && styles.pressed]}
            >
              <Text style={styles.settingIcon}>{strings.account.icon}</Text>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>{strings.account.title}</Text>
                <Text numberOfLines={1} style={styles.settingSubtitle}>
                  {session?.user?.email || strings.account.guestShort}
                </Text>
              </View>
              <Text style={styles.settingValue}>→</Text>
            </Pressable>

            <Text style={styles.subsectionTitle}>{strings.settings.chooseDifficulty}</Text>
            <View style={styles.choiceGrid}>
              {PLAYABLE_DIFFICULTIES.map((difficulty) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: currentDifficulty === difficulty }}
                    key={difficulty}
                    onPress={() => onSelectDifficulty(difficulty)}
                    style={({ pressed }) => [
                      styles.choiceButton,
                      currentDifficulty === difficulty && styles.activeChoiceButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.choiceIcon, currentDifficulty === difficulty && styles.activeChoiceText]}>
                      {difficultyIcon(difficulty)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.choiceText, currentDifficulty === difficulty && styles.activeChoiceText]}
                    >
                      {strings.difficulties[difficulty]}
                    </Text>
                  </Pressable>
                ))}
            </View>
          </PanelSection>

          <PanelSection title={strings.settings.leaderboard}>
            <View style={styles.leagueSummary}>
              <Text style={styles.leagueSummaryTitle}>
                {strings.leaderboard.week}: {weeklyScore}
              </Text>
              <Text style={styles.leagueSummaryText}>
                {strings.status.league}: {strings.leagues[league.id]} · {weekKey}
              </Text>
            </View>
            {leaderboard.map((item, index) => (
              <View key={`${item.name}-${index}`} style={[styles.leaderRow, item.isUser && styles.userLeaderRow]}>
                <Text style={styles.leaderRank}>{index + 1}</Text>
                <Text numberOfLines={1} style={[styles.leaderName, item.isUser && styles.userLeaderText]}>
                  {item.name}
                </Text>
                <Text style={[styles.leaderScore, item.isUser && styles.userLeaderText]}>{item.score}</Text>
              </View>
            ))}
            <Text style={styles.noteText}>{strings.settings.localLeaderboardNote}</Text>
          </PanelSection>

          <PanelSection title={strings.settings.achievements}>
            <View style={styles.badgeGrid}>
              {BADGE_DEFS.map((badge) => (
                <BadgeItem
                  badge={badge}
                  key={badge.id}
                  locked={!isBadgeUnlocked(badge, progress)}
                  strings={strings}
                />
              ))}
            </View>
          </PanelSection>
        </ScrollView>
      </View>
    </View>
  );
}

function CompletionPanel({ onClose, onNext, strings, summary }) {
  if (!summary) {
    return null;
  }

  const league = getLeagueForScore(summary.weeklyScore);

  return (
    <View style={styles.completionOverlay}>
      <View style={styles.completionCard}>
        <Text style={styles.modalTitle}>{strings.completion.title}</Text>
        <View style={styles.completionStats}>
          <MiniStat icon="Σ" label={strings.completion.score} value={summary.score} />
          <MiniStat icon="=" label={strings.completion.moves} value={summary.moves} />
          <MiniStat icon="◆" label={strings.completion.targets} value={summary.targets} />
          <MiniStat icon={league.icon} label={strings.completion.league} value={strings.leagues[league.id]} />
        </View>
        <Text style={styles.subsectionTitle}>{strings.completion.newBadges}</Text>
        {summary.newBadgeIds.length > 0 ? (
          <View style={styles.badgeGrid}>
            {summary.newBadgeIds.map((badgeId) => (
              <BadgeItem
                badge={BADGE_DEFS.find((badge) => badge.id === badgeId)}
                key={badgeId}
                strings={strings}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>{strings.completion.noNewBadges}</Text>
        )}
        <View style={styles.completionActions}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>{strings.completion.close}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onNext}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>{strings.completion.next}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PanelSection({ children, title }) {
  return (
    <View style={styles.panelSection}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MiniStat({ icon, label, value }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatIcon}>{icon}</Text>
      <Text numberOfLines={1} style={styles.miniStatLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}

function BadgeItem({ badge, locked = false, strings }) {
  if (!badge) {
    return null;
  }

  const copy = strings.badges[badge.id];

  return (
    <View style={[styles.badgeItem, locked && styles.lockedBadge]}>
      <Text style={styles.badgeIcon}>{badge.icon}</Text>
      <Text numberOfLines={1} style={styles.badgeTitle}>{copy.title}</Text>
      <Text numberOfLines={2} style={styles.badgeDescription}>{copy.description}</Text>
    </View>
  );
}

function NumberTile({
  compact = false,
  disabled = false,
  hinted = false,
  number,
  onDragEnd,
  onDragMove,
  onDragStart,
  registerTile,
  size,
  strings,
}) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !disabled && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
        onPanResponderGrant: (event) => onDragStart(number, event),
        onPanResponderMove: (event) => onDragMove(number, event),
        onPanResponderRelease: (event) => onDragEnd(number, event),
        onPanResponderTerminate: (event) => onDragEnd(number, event),
      }),
    [disabled, number, onDragEnd, onDragMove, onDragStart],
  );
  const tilePadding = compact ? Math.max(3, Math.round(size * 0.12)) : 7;
  const textSize = compact ? Math.max(14, Math.min(22, Math.round(size * 0.5))) : 27;

  return (
    <View
      ref={(node) => registerTile(number.id, node)}
      accessible
      accessibilityLabel={strings.messages.dragToAnother(number.value)}
      accessibilityRole="button"
      style={[
        styles.numberTile,
        number.kind === 'given' ? styles.givenTile : styles.resultTile,
        compact && styles.compactTile,
        hinted && styles.hintedTile,
        disabled && styles.disabledTile,
        { height: size, padding: tilePadding, width: size },
      ]}
      {...panResponder.panHandlers}
    >
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.numberText, compact && styles.compactNumberText, { fontSize: textSize }]}
      >
        {number.value}
      </Text>
    </View>
  );
}

function DragGhost({ dragState }) {
  const size = dragState.size + 10;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.dragGhost,
        {
          height: size,
          left: dragState.localX - size / 2,
          top: dragState.localY - size / 2,
          width: size,
        },
      ]}
    >
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.dragGhostText}>
        {dragState.value}
      </Text>
    </View>
  );
}

function OperationDial({ a, b, error, onCancel, onSelect, onSwap, strings, visible }) {
  if (!visible || !a || !b) {
    return null;
  }

  return (
    <View style={styles.dialBackdrop}>
      <Pressable
        accessibilityLabel={strings.actions.closeDial}
        accessibilityRole="button"
        onPress={onCancel}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.dialCard}>
        <Text style={styles.dialTitle}>{strings.dial.title}</Text>
        <View style={styles.dialWheel}>
          <OperationButton op="+" placement={styles.dialTop} onPress={onSelect} strings={strings} />
          <OperationButton op="-" placement={styles.dialLeft} onPress={onSelect} strings={strings} />
          <View style={styles.dialCenter}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.dialExpression}>
              {a.value} ? {b.value}
            </Text>
            <Pressable
              accessibilityLabel={strings.actions.swapA11y}
              accessibilityRole="button"
              onPress={onSwap}
              style={({ pressed }) => [styles.swapButton, pressed && styles.pressed]}
            >
              <Text style={styles.swapText}>{strings.actions.swap}</Text>
            </Pressable>
          </View>
          <OperationButton op="×" placement={styles.dialRight} onPress={onSelect} strings={strings} />
          <OperationButton op="÷" placement={styles.dialBottom} onPress={onSelect} strings={strings} />
        </View>
        {error ? <Text style={styles.dialError}>{error}</Text> : null}
      </View>
    </View>
  );
}

function OperationButton({ onPress, op, placement, strings }) {
  return (
    <Pressable
      accessibilityLabel={strings.dial.operationA11y(op)}
      accessibilityRole="button"
      onPress={() => onPress(op)}
      style={({ pressed }) => [styles.operationButton, placement, pressed && styles.pressed]}
    >
      <Text style={styles.operationText}>{op}</Text>
    </Pressable>
  );
}

function TutorialOverlay({ metrics, onAdvance, step, strings, visible }) {
  if (!visible) {
    return null;
  }

  const currentStep = strings.tutorial[step] || strings.tutorial[0];
  const placement = getTutorialPlacement(step, metrics);
  const isLastStep = step === strings.tutorial.length - 1;

  return (
    <Pressable
      accessibilityLabel={strings.actions.advanceTutorial}
      accessibilityRole="button"
      onPress={onAdvance}
      style={styles.tutorialOverlay}
    >
      <View style={styles.tutorialDim} />
      <View style={[styles.tutorialCard, placement]}>
        <Text style={styles.tutorialCounter}>
          {step + 1}/{strings.tutorial.length}
        </Text>
        <Text style={styles.tutorialTitle}>{currentStep.title}</Text>
        <Text style={styles.tutorialText}>{currentStep.text}</Text>
        <Text style={styles.tutorialNext}>
          {isLastStep ? strings.tutorialStart : strings.tutorialNext}
        </Text>
      </View>
    </Pressable>
  );
}

function getTutorialPlacement(step, metrics) {
  if (metrics.isWide) {
    const widePlacements = [
      { left: 28, top: 94 },
      { bottom: 120, right: 36 },
      { bottom: 102, right: 36 },
      { bottom: 88, right: 36 },
      { bottom: 36, right: 36 },
    ];
    return widePlacements[step] || widePlacements[0];
  }

  const phonePlacements = [
    { left: 16, right: 16, top: 112 },
    { bottom: metrics.isTinyPhone ? 168 : 190, left: 16, right: 16 },
    { bottom: metrics.isTinyPhone ? 146 : 166, left: 16, right: 16 },
    { bottom: metrics.isTinyPhone ? 120 : 136, left: 16, right: 16 },
    { bottom: 28, left: 16, right: 16 },
  ];
  return phonePlacements[step] || phonePlacements[0];
}

async function findDropTarget(tileRefs, bank, sourceId, pageX, pageY) {
  const measurements = await Promise.all(
    bank
      .filter((number) => number.id !== sourceId)
      .map((number) => measureTile(tileRefs[number.id], number)),
  );

  const hit = measurements.find(
    (item) =>
      item &&
      pageX >= item.x &&
      pageX <= item.x + item.width &&
      pageY >= item.y &&
      pageY <= item.y + item.height,
  );

  return hit?.number || null;
}

function measureTile(ref, number) {
  return new Promise((resolve) => {
    if (!ref?.measureInWindow) {
      resolve(null);
      return;
    }

    ref.measureInWindow((x, y, width, height) => {
      resolve({ height, number, width, x, y });
    });
  });
}

function createGame(difficulty = 'paper', existingPuzzle = null, strings = STRINGS.tr, options = {}) {
  const mode = options.mode || MODE_NORMAL;
  const challengeKey = options.challengeKey || null;
  const puzzle =
    existingPuzzle ||
    (difficulty === 'paper'
      ? makePaperPuzzle(DIFFICULTIES.paper)
      : makeRandomPuzzle(DIFFICULTIES[difficulty]));
  let idCounter = 1;
  const bank = puzzle.source.map((value) => {
    const id = `g-${idCounter}`;
    idCounter += 1;
    return { id, value, kind: 'given', expression: '' };
  });

  return {
    challengeKey,
    difficulty,
    boardSize: puzzle.boardSize,
    name: strings.gameNames[difficulty] || puzzle.name,
    initialPuzzle: clonePuzzle(puzzle),
    idCounter,
    ops: puzzle.ops,
    par: puzzle.par,
    bank,
    targets: puzzle.targets.map((target, index) => ({
      id: `t-${index}`,
      value: target.value,
      row: target.row,
      col: target.col,
      solution: target.solution ? target.solution.map((step) => ({ ...step })) : [],
      solved: false,
      solvedAt: null,
    })),
    history: [],
    steps: 0,
    message: strings.messages.start,
    mode,
    complete: false,
  };
}

function clonePuzzle(puzzle) {
  return {
    boardSize: puzzle.boardSize,
    source: [...puzzle.source],
    targets: puzzle.targets.map((target) => ({
      ...target,
      solution: target.solution ? target.solution.map((step) => ({ ...step })) : [],
    })),
    ops: [...puzzle.ops],
    par: puzzle.par,
    name: puzzle.name,
  };
}

function makePaperPuzzle(config) {
  return clonePuzzle(config);
}

function makeDailyPuzzle(dateKey, difficulty = 'medium') {
  const config = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;
  return makeRandomPuzzle(config, makeSeededRandom(`daily-${dateKey}-${difficulty}`));
}

function makeWeeklyPuzzle(weekKey) {
  return makeRandomPuzzle(DIFFICULTIES.weekly, makeSeededRandom(`weekly-${weekKey}`));
}

function makeRandomPuzzle(config, random = Math.random) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const targetCount = config.targetCount || randomInt(
      config.targetCountRange[0],
      config.targetCountRange[1],
      random,
    );
    const source = uniqueRandomNumbers(config.sourceCount, 1, config.maxBase, random);
    const pool = [...source];
    const targets = [];
    let par = 0;

    for (let index = 0; index < targetCount; index += 1) {
      const depth = randomItem(config.chainDepths, random);
      const built = buildTarget(pool, config.ops, config.maxTarget, depth, random);

      if (!built || targets.some((target) => target.value === built.value)) {
        break;
      }

      par += built.steps;
      pool.push(...built.intermediates, built.value);
      targets.push({ solution: built.solution, value: built.value });
    }

    if (targets.length === targetCount) {
      const cells = shuffledCells(config.boardSize, random);
      return {
        boardSize: config.boardSize,
        source,
        targets: targets.map((target, index) => ({
          ...target,
          row: cells[index].row,
          col: cells[index].col,
        })),
        ops: [...config.ops],
        par,
        name: config.name,
      };
    }
  }

  return makePaperPuzzle(DIFFICULTIES.paper);
}

function buildTarget(pool, ops, maxTarget, depth, random = Math.random) {
  const localPool = [...pool];
  const intermediates = [];
  const solution = [];
  let value = null;

  for (let step = 0; step < depth; step += 1) {
    const result = randomValidOperation(localPool, ops, maxTarget, random);
    if (!result) {
      return null;
    }

    value = result.value;
    solution.push({
      a: result.a,
      b: result.b,
      op: result.op,
      result: result.value,
    });
    if (step < depth - 1) {
      intermediates.push(value);
      localPool.push(value);
    }
  }

  return { value, intermediates, solution, steps: depth };
}

function randomValidOperation(pool, ops, maxTarget, random = Math.random) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const pair = randomPoolPair(pool, random);
    if (!pair) {
      return null;
    }

    let [a, b] = pair;
    const op = randomItem(ops, random);
    let value = null;

    if (op === '+') {
      value = a + b;
    }

    if (op === '-') {
      if (a === b) {
        continue;
      }

      if (a < b) {
        [a, b] = [b, a];
      }
      value = a - b;
    }

    if (op === '×') {
      value = a * b;
    }

    if (op === '÷') {
      if (b === 0) {
        continue;
      }

      if (a % b !== 0) {
        if (a === 0 || b % a !== 0) {
          continue;
        }
        [a, b] = [b, a];
      }

      if (b === 0) {
        continue;
      }
      value = a / b;
    }

    if (Number.isInteger(value) && value > 0 && value <= maxTarget) {
      return { a, b, op, value };
    }
  }

  return null;
}

function randomPoolPair(pool, random = Math.random) {
  if (pool.length < 2) {
    return null;
  }

  const firstIndex = randomInt(0, pool.length - 1, random);
  let secondIndex = randomInt(0, pool.length - 2, random);
  if (secondIndex >= firstIndex) {
    secondIndex += 1;
  }

  return [pool[firstIndex], pool[secondIndex]];
}

function uniqueRandomNumbers(count, min, max, random = Math.random) {
  const numbers = new Set();
  while (numbers.size < count) {
    numbers.add(randomInt(min, max, random));
  }
  return [...numbers].sort((a, b) => a - b);
}

function shuffledCells(size, random = Math.random) {
  const cells = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      cells.push({ row, col });
    }
  }
  return shuffle(cells, random);
}

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index, random);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function randomInt(min, max, random = Math.random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomItem(items, random = Math.random) {
  return items[Math.floor(random() * items.length)];
}

function makeChallengeRoomCode(random = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => alphabet[randomInt(0, alphabet.length - 1, random)]).join('');
}

function findNumber(game, id) {
  return game.bank.find((number) => number.id === id);
}

function getHintCandidates(game) {
  const unsolvedTargets = game.targets.filter((target) => !target.solved);
  const solutionCandidates = [];

  unsolvedTargets.forEach((target) => {
    const steps = target.solution || [];
    for (const step of steps) {
      if (game.bank.some((number) => number.value === step.result)) {
        continue;
      }

      const pair = findNumberPairByValues(game.bank, step.a, step.b);
      if (pair) {
        solutionCandidates.push(makeHintCandidate(pair));
        break;
      }
    }
  });

  return uniqueHintCandidates([
    ...solutionCandidates,
    ...getDirectTargetHintCandidates(game, unsolvedTargets),
  ]);
}

function getDirectTargetHintCandidates(game, targets) {
  const candidates = [];

  targets.forEach((target) => {
    for (let firstIndex = 0; firstIndex < game.bank.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < game.bank.length; secondIndex += 1) {
        const first = game.bank[firstIndex];
        const second = game.bank[secondIndex];
        const reachesTarget = game.ops.some(
          (op) =>
            operationValueForHint(first.value, second.value, op) === target.value ||
            operationValueForHint(second.value, first.value, op) === target.value,
        );

        if (reachesTarget) {
          candidates.push(makeHintCandidate([first, second]));
        }
      }
    }
  });

  return candidates;
}

function makeHintCandidate(pair) {
  const ids = pair.map((number) => number.id);
  return {
    ids,
    key: [...ids].sort().join(':'),
  };
}

function uniqueHintCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.key)) {
      return false;
    }
    seen.add(candidate.key);
    return true;
  });
}

function findNumberPairByValues(bank, firstValue, secondValue) {
  const first = bank.find((number) => number.value === firstValue);
  if (!first) {
    return null;
  }

  const second = bank.find(
    (number) => number.id !== first.id && number.value === secondValue,
  );
  return second ? [first, second] : null;
}

function operationValueForHint(a, b, op) {
  if (op === '+') {
    return a + b;
  }

  if (op === '-') {
    const value = a - b;
    return value > 0 ? value : null;
  }

  if (op === '×') {
    return a * b;
  }

  if (op === '÷') {
    return b !== 0 && a % b === 0 ? a / b : null;
  }

  return null;
}

function applyOperation(a, b, op, strings = STRINGS.tr) {
  if (op === '+') {
    return { ok: true, value: a + b };
  }

  if (op === '-') {
    const value = a - b;
    if (value < 0) {
      return { ok: false, message: strings.messages.negative };
    }
    if (value === 0) {
      return { ok: false, message: strings.messages.zero };
    }
    return { ok: true, value };
  }

  if (op === '×') {
    return { ok: true, value: a * b };
  }

  if (op === '÷') {
    if (b === 0) {
      return { ok: false, message: strings.messages.divideByZero };
    }
    if (a % b !== 0) {
      return { ok: false, message: strings.messages.divisionInteger };
    }
    return { ok: true, value: a / b };
  }

  return { ok: false, message: strings.messages.unsupported };
}

function calculateScore(game) {
  const solved = game.targets.filter((target) => target.solved).length;
  return Math.max(0, solved * 30 - game.steps * 2);
}

async function loadBestScores() {
  const entries = await Promise.all(
    Object.keys(DIFFICULTIES).map(async (difficulty) => {
      const value = await AsyncStorage.getItem(bestScoreKey(difficulty));
      return [difficulty, Number(value || 0)];
    }),
  );
  return Object.fromEntries(entries);
}

async function saveBestScore(difficulty, score, bestScores, setBestScores) {
  if (score <= (bestScores[difficulty] || 0)) {
    return;
  }

  await AsyncStorage.setItem(bestScoreKey(difficulty), String(score));
  setBestScores((currentScores) => ({ ...currentScores, [difficulty]: score }));
}

function bestScoreKey(difficulty) {
  return `${BEST_SCORE_PREFIX}-${difficulty}`;
}

function progressStorageKey(userId) {
  return `${PROGRESS_OWNER_KEY_PREFIX}:${userId ? `user:${userId}` : 'guest'}`;
}

async function loadProgress(userId = null) {
  try {
    const scopedKey = progressStorageKey(userId);
    let raw = await AsyncStorage.getItem(scopedKey);

    if (!raw && !userId) {
      raw = await AsyncStorage.getItem(PROGRESS_KEY);
      if (raw) {
        await AsyncStorage.setItem(scopedKey, raw);
      }
    }

    return normalizeProgress(raw ? JSON.parse(raw) : DEFAULT_PROGRESS);
  } catch {
    return normalizeProgress(DEFAULT_PROGRESS);
  }
}

async function saveProgress(progress, userId = null) {
  try {
    await AsyncStorage.setItem(progressStorageKey(userId), JSON.stringify(progress));
  } catch {
    // Progress is nice to have; gameplay should continue if storage fails.
  }
}

function normalizeProgress(progress) {
  const currentWeekKey = getWeekKey();
  const completedWeeklyKeys = progress?.completedWeeklyKeys || {};
  const weeklyScores = progress?.weeklyScores || {};
  const currentWeeklyScore = Number(weeklyScores[currentWeekKey] || 0) || 0;
  const streak = { ...DEFAULT_PROGRESS.streak, ...(progress?.streak || {}) };

  return {
    achievements: { ...DEFAULT_PROGRESS.achievements, ...(progress?.achievements || {}) },
    completedDailyDates: {
      ...DEFAULT_PROGRESS.completedDailyDates,
      ...(progress?.completedDailyDates || {}),
    },
    completedStreakDates: {
      ...DEFAULT_PROGRESS.completedStreakDates,
      ...(progress?.completedDailyDates || {}),
      ...(progress?.completedStreakDates || {}),
    },
    completedWeeklyKeys: completedWeeklyKeys[currentWeekKey] ? { [currentWeekKey]: true } : {},
    stats: { ...DEFAULT_PROGRESS.stats, ...(progress?.stats || {}) },
    streak: {
      ...streak,
      current: getActiveStreak(streak.current, streak.lastDailyDate),
    },
    weeklyScores: { [currentWeekKey]: currentWeeklyScore },
  };
}

function mergeProgressWithCloud(localProgress, cloudProgress) {
  const local = normalizeProgress(localProgress);
  if (!cloudProgress) {
    return local;
  }

  const cloudStats = cloudProgress.stats || {};
  const cloudLastDate = cloudStats.last_streak_date || null;
  const localLastDate = local.streak.lastDailyDate || null;
  const cloudStreakIsNewer = Boolean(
    cloudLastDate && (!localLastDate || cloudLastDate >= localLastDate),
  );
  const cloudCompletedDailyDates = {};
  const cloudCompletedStreakDates = {};

  (cloudProgress.dailyProgress || []).forEach((day) => {
    if (day.daily_challenge_completed) {
      cloudCompletedDailyDates[day.daily_challenge_key || day.date] = true;
    }
    if (day.streak_awarded) {
      cloudCompletedStreakDates[day.date] = true;
    }
  });

  const cloudAchievements = Object.fromEntries(
    (cloudProgress.achievements || []).map(({ achievement_key: key }) => [key, true]),
  );
  const cloudWeekly = cloudProgress.weeklyScore;
  const cloudCompletedWeeklyKeys =
    cloudWeekly?.weekly_challenge_completed && cloudWeekly.week_key
      ? { [cloudWeekly.week_key]: true }
      : {};
  const cloudWeeklyScores = cloudWeekly?.week_key
    ? { [cloudWeekly.week_key]: Number(cloudWeekly.score || 0) }
    : {};

  return normalizeProgress({
    ...local,
    achievements: {
      ...local.achievements,
      ...cloudAchievements,
    },
    completedDailyDates: {
      ...local.completedDailyDates,
      ...cloudCompletedDailyDates,
    },
    completedStreakDates: {
      ...local.completedStreakDates,
      ...cloudCompletedStreakDates,
    },
    completedWeeklyKeys: {
      ...local.completedWeeklyKeys,
      ...cloudCompletedWeeklyKeys,
    },
    stats: {
      ...local.stats,
      bestScore: Math.max(local.stats.bestScore, Number(cloudStats.best_score || 0)),
      gamesCompleted: Math.max(
        local.stats.gamesCompleted,
        Number(cloudStats.games_completed || 0),
      ),
      gamesPlayed: Math.max(local.stats.gamesPlayed, Number(cloudStats.games_played || 0)),
      perfectGames: Math.max(local.stats.perfectGames, Number(cloudStats.perfect_games || 0)),
      targetsSolved: Math.max(
        local.stats.targetsSolved,
        Number(cloudStats.targets_solved || 0),
      ),
      totalMoves: Math.max(local.stats.totalMoves, Number(cloudStats.total_moves || 0)),
      totalScore: Math.max(local.stats.totalScore, Number(cloudStats.total_score || 0)),
    },
    streak: {
      best: Math.max(local.streak.best, Number(cloudStats.best_streak || 0)),
      current: cloudStreakIsNewer
        ? Number(cloudStats.current_streak || 0)
        : local.streak.current,
      lastDailyDate: cloudStreakIsNewer ? cloudLastDate : localLastDate,
    },
    weeklyScores: {
      ...local.weeklyScores,
      ...Object.fromEntries(
        Object.entries(cloudWeeklyScores).map(([key, score]) => [
          key,
          Math.max(local.weeklyScores[key] || 0, score),
        ]),
      ),
    },
  });
}

function recordGameCompletion(progress, game, score) {
  const nextProgress = normalizeProgress(progress);
  const todayKey = getDateKey();
  const weekKey = getWeekKey();
  const previousAchievements = { ...nextProgress.achievements };
  const solvedTargets = game.targets.filter((target) => target.solved).length;
  const award = getCompletionAward(nextProgress, game, score);
  const shouldTriggerStreak = game.difficulty !== 'paper';
  const streakAlreadyDone = Boolean(nextProgress.completedStreakDates[todayKey]);

  nextProgress.stats = {
    ...nextProgress.stats,
    bestScore: Math.max(nextProgress.stats.bestScore, award.score),
    gamesCompleted: nextProgress.stats.gamesCompleted + 1,
    gamesPlayed: nextProgress.stats.gamesPlayed + 1,
    perfectGames: nextProgress.stats.perfectGames + (game.steps <= game.par ? 1 : 0),
    targetsSolved: nextProgress.stats.targetsSolved + solvedTargets,
    totalMoves: nextProgress.stats.totalMoves + game.steps,
    totalScore: nextProgress.stats.totalScore + award.score,
  };

  if (shouldTriggerStreak && !streakAlreadyDone) {
    const yesterdayKey = getDateKey(addDays(parseDateKey(todayKey), -1));
    const nextStreak =
      nextProgress.streak.lastDailyDate === yesterdayKey
        ? nextProgress.streak.current + 1
        : 1;

    nextProgress.completedStreakDates = {
      ...nextProgress.completedStreakDates,
      [todayKey]: true,
    };
    nextProgress.streak = {
      best: Math.max(nextProgress.streak.best, nextStreak),
      current: nextStreak,
      lastDailyDate: todayKey,
    };
  }

  if (game.mode === MODE_DAILY && game.challengeKey) {
    nextProgress.completedDailyDates = {
      ...nextProgress.completedDailyDates,
      [game.challengeKey]: true,
    };
  }

  if (game.mode === MODE_WEEKLY && game.challengeKey) {
    nextProgress.completedWeeklyKeys = {
      ...nextProgress.completedWeeklyKeys,
      [game.challengeKey]: true,
    };
  }

  if (award.score > 0) {
    nextProgress.weeklyScores = {
      ...nextProgress.weeklyScores,
      [weekKey]: (nextProgress.weeklyScores[weekKey] || 0) + award.score,
    };
  }

  const dailyBadgeIds =
    game.mode === MODE_DAILY && game.challengeKey && !award.alreadyCompleted
      ? ['daily_first']
      : [];
  const permanentBadgeIds = BADGE_DEFS
    .filter((badge) => !badge.recurring && isBadgeEarned(badge.id, nextProgress))
    .map((badge) => badge.id)
    .filter((badgeId) => {
      nextProgress.achievements[badgeId] = true;
      return !previousAchievements[badgeId];
    });
  const newBadgeIds = [...dailyBadgeIds, ...permanentBadgeIds];

  return {
    progress: nextProgress,
    summary: {
      mode: game.mode,
      moves: game.steps,
      newBadgeIds,
      score: award.score,
      targets: solvedTargets,
      weeklyScore: nextProgress.weeklyScores[weekKey] || 0,
    },
  };
}

function getCompletionAward(progress, game, baseScore) {
  if (game.mode === MODE_DAILY && game.challengeKey) {
    const alreadyCompleted = Boolean(progress.completedDailyDates[game.challengeKey]);
    return {
      alreadyCompleted,
      score: alreadyCompleted ? 0 : Math.round(baseScore * 1.5),
    };
  }

  if (game.mode === MODE_WEEKLY && game.challengeKey) {
    const alreadyCompleted = Boolean(progress.completedWeeklyKeys[game.challengeKey]);
    return {
      alreadyCompleted,
      score: alreadyCompleted ? 0 : baseScore,
    };
  }

  return {
    alreadyCompleted: false,
    score: baseScore,
  };
}

function isBadgeEarned(badgeId, progress) {
  if (badgeId === 'first_win') {
    return progress.stats.gamesCompleted >= 1;
  }
  if (badgeId === 'daily_first') {
    return Boolean(progress.completedDailyDates[getDateKey()]);
  }
  if (badgeId === 'weekly_first') {
    return Object.keys(progress.completedWeeklyKeys).length >= 1;
  }
  if (badgeId === 'streak_3') {
    return progress.streak.best >= 3;
  }
  if (badgeId === 'streak_7') {
    return progress.streak.best >= 7;
  }
  if (badgeId === 'streak_14') {
    return progress.streak.best >= 14;
  }
  if (badgeId === 'perfect') {
    return progress.stats.perfectGames >= 1;
  }
  if (badgeId === 'games_5') {
    return progress.stats.gamesCompleted >= 5;
  }
  if (badgeId === 'games_20') {
    return progress.stats.gamesCompleted >= 20;
  }
  if (badgeId === 'targets_50') {
    return progress.stats.targetsSolved >= 50;
  }
  if (badgeId === 'score_1000') {
    return progress.stats.totalScore >= 1000;
  }
  if (badgeId === 'score_5000') {
    return progress.stats.totalScore >= 5000;
  }
  return false;
}

function isBadgeUnlocked(badge, progress) {
  if (badge.recurring === 'daily') {
    return isBadgeEarned(badge.id, progress);
  }
  return Boolean(progress.achievements[badge.id]) || isBadgeEarned(badge.id, progress);
}

function getRecentStreakDays(progress, strings) {
  const today = new Date();
  const weekStart = getWeekStart(today);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const key = getDateKey(date);
    return {
      completed: Boolean(progress.completedStreakDates[key]),
      key,
      label: strings.streakPage.dayLabels[date.getDay()],
      today: key === getDateKey(today),
    };
  });
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekKey(date = new Date()) {
  const weekStart = getWeekStart(date);
  return getDateKey(weekStart);
}

function getWeekStart(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function makeSeededRandom(seedText) {
  let seed = hashSeed(seedText);
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function hashSeed(seedText) {
  let hash = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    hash ^= seedText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getLeagueForScore(score) {
  return LEAGUE_DEFS.reduce((currentLeague, league) => {
    if (score >= league.min) {
      return league;
    }
    return currentLeague;
  }, LEAGUE_DEFS[0]);
}

function makeWeeklyLeaderboard(weeklyScore, weekKey, strings) {
  const random = makeSeededRandom(`leader-${weekKey}`);
  const rivals = strings.leaderboard.rivals.map((name, index) => ({
    isUser: false,
    name,
    score: Math.max(0, 120 + Math.floor(random() * 1900) - index * 70),
  }));

  return [
    ...rivals,
    {
      isUser: true,
      name: strings.settings.you,
      score: weeklyScore,
    },
  ].sort((a, b) => b.score - a.score);
}

function difficultyIcon(difficulty) {
  if (difficulty === 'paper') {
    return '0';
  }
  if (difficulty === 'easy') {
    return '1';
  }
  if (difficulty === 'medium') {
    return '2';
  }
  if (difficulty === 'hard') {
    return '3';
  }
  return 'U';
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#f7f8fb',
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: '#147b76',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#20242a',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 36,
  },
  topActions: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  activeIconButton: {
    borderColor: '#1fa7a0',
  },
  primaryIconButton: {
    backgroundColor: '#1fa7a0',
    borderColor: '#1fa7a0',
  },
  iconText: {
    color: '#20242a',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 22,
  },
  activeIconText: {
    color: '#147b76',
  },
  iconLabel: {
    color: '#20242a',
    fontSize: 10,
    fontWeight: '900',
    marginTop: 1,
  },
  primaryIconText: {
    color: '#ffffff',
  },
  statsRow: {
    flexDirection: 'row',
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
  statLabel: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '800',
  },
  statValue: {
    color: '#20242a',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 1,
  },
  streakBadge: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    height: 36,
    justifyContent: 'center',
    minWidth: 54,
    paddingHorizontal: 7,
    position: 'relative',
    overflow: 'hidden',
  },
  streakBadgeCompact: {
    height: 32,
    minWidth: 48,
    paddingHorizontal: 5,
  },
  streakBadgeComplete: {
    backgroundColor: '#e7fbf8',
    elevation: 4,
    shadowColor: '#1fa7a0',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
  },
  streakBadgeIdle: {
    backgroundColor: 'transparent',
    opacity: 0.9,
  },
  streakBadgeValue: {
    color: '#8a949d',
    fontSize: 15,
    fontWeight: '900',
    marginLeft: 5,
  },
  streakBadgeValueComplete: {
    color: '#147b76',
  },
  streakBadgeGlow: {
    backgroundColor: '#8fe4df',
    borderRadius: 22,
    bottom: -6,
    left: -4,
    position: 'absolute',
    right: -4,
    top: -6,
  },
  fireIcon: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'flex-end',
    position: 'relative',
    width: 24,
  },
  fireIconCompact: {
    height: 25,
    width: 21,
  },
  fireIconLarge: {
    height: 116,
    marginBottom: 18,
    width: 94,
  },
  fireOuter: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 18,
    bottom: 2,
    height: 24,
    position: 'absolute',
    transform: [{ rotate: '-28deg' }],
    width: 18,
  },
  fireOuterCompact: {
    height: 21,
    width: 16,
  },
  fireOuterLarge: {
    borderBottomLeftRadius: 54,
    borderBottomRightRadius: 24,
    borderTopLeftRadius: 68,
    borderTopRightRadius: 56,
    bottom: 8,
    height: 96,
    width: 70,
  },
  fireOuterActive: {
    backgroundColor: '#27b7af',
  },
  fireOuterIdle: {
    backgroundColor: '#8a949d',
  },
  fireSide: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 14,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 10,
    bottom: 2,
    height: 17,
    position: 'absolute',
    right: 2,
    transform: [{ rotate: '24deg' }],
    width: 12,
  },
  fireSideCompact: {
    height: 15,
    width: 10,
  },
  fireSideLarge: {
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 42,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 32,
    bottom: 9,
    height: 66,
    right: 9,
    width: 42,
  },
  fireSideActive: {
    backgroundColor: '#14928c',
  },
  fireSideIdle: {
    backgroundColor: '#68737d',
  },
  fireCore: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    bottom: 2,
    height: 12,
    position: 'absolute',
    width: 9,
  },
  fireCoreCompact: {
    height: 10,
    width: 8,
  },
  fireCoreLarge: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
    bottom: 10,
    height: 42,
    width: 34,
  },
  fireCoreActive: {
    backgroundColor: '#b9f4f0',
  },
  fireCoreIdle: {
    backgroundColor: '#f7f8fb',
  },
  fireGlow: {
    backgroundColor: '#8fe4df',
    borderRadius: 16,
    bottom: 0,
    height: 30,
    position: 'absolute',
    width: 28,
  },
  fireGlowLarge: {
    borderRadius: 58,
    bottom: 2,
    height: 112,
    width: 104,
  },
  homeContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  homeTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  homeHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  accountButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  accountButtonActive: {
    backgroundColor: '#d9f5f2',
    borderColor: '#1fa7a0',
  },
  accountButtonText: {
    color: '#68737d',
    fontSize: 14,
    fontWeight: '900',
  },
  accountButtonTextActive: {
    color: '#147b76',
  },
  homeTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  homeTitle: {
    color: '#20242a',
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 39,
  },
  homeModeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  homeModeTile: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 132,
    minWidth: 132,
    padding: 14,
  },
  homeModeIcon: {
    color: '#147b76',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 10,
  },
  homeModeTitle: {
    color: '#20242a',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
    textAlign: 'center',
  },
  homeBadgePanel: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    padding: 10,
  },
  homeBadgeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  homeBadgeTitle: {
    color: '#20242a',
    fontSize: 16,
    fontWeight: '900',
  },
  homeBadgeCount: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '900',
  },
  badgeListItem: {
    alignItems: 'center',
    borderTopColor: '#edf2f5',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingVertical: 7,
  },
  badgeListIconWrap: {
    alignItems: 'center',
    backgroundColor: '#d9f5f2',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    marginRight: 9,
    width: 38,
  },
  badgeListIcon: {
    color: '#147b76',
    fontSize: 14,
    fontWeight: '900',
  },
  badgeListCopy: {
    flex: 1,
    minWidth: 0,
  },
  badgeListTitle: {
    color: '#20242a',
    fontSize: 12,
    fontWeight: '900',
  },
  badgeListDescription: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
    marginTop: 1,
  },
  badgeListState: {
    color: '#147b76',
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 8,
  },
  homePageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  homePageTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  homeBackButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    marginBottom: 3,
    paddingRight: 12,
    paddingVertical: 3,
  },
  homeBackIcon: {
    color: '#147b76',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 24,
  },
  homeBackText: {
    color: '#147b76',
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 2,
  },
  modeDetailCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  homeCardText: {
    color: '#68737d',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  homeMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  homeStatus: {
    color: '#147b76',
    fontSize: 11,
    fontWeight: '900',
    marginRight: 2,
  },
  homeMetaPill: {
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  homeMetaLabel: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '900',
  },
  homeMetaValue: {
    color: '#20242a',
    fontSize: 10,
    fontWeight: '900',
  },
  homeButton: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  homeButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  homeLevelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 11,
  },
  homeLevelButton: {
    alignItems: 'center',
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '23%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 68,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  homeLevelIcon: {
    color: '#147b76',
    fontSize: 15,
    fontWeight: '900',
  },
  homeLevelText: {
    color: '#20242a',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 3,
  },
  roomPanel: {
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    padding: 10,
  },
  roomHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  roomTitle: {
    color: '#20242a',
    fontSize: 15,
    fontWeight: '900',
  },
  roomWeek: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '900',
  },
  roomState: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 9,
    padding: 10,
  },
  roomLabel: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  roomCode: {
    color: '#20242a',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 2,
  },
  roomMessage: {
    color: '#56616b',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 5,
  },
  roomActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },
  gameArea: {
    flex: 1,
    minHeight: 0,
  },
  gameAreaWide: {
    flexDirection: 'row',
  },
  boardPane: {
    alignItems: 'center',
  },
  sectionHeader: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#20242a',
    fontSize: 21,
    fontWeight: '900',
  },
  board: {
    alignSelf: 'center',
    backgroundColor: '#dfeaf0',
    borderRadius: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  boardCell: {
    alignItems: 'center',
    backgroundColor: '#edf4f7',
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
  },
  targetCell: {
    backgroundColor: '#b9edf0',
  },
  solvedCell: {
    backgroundColor: '#dff8ea',
    borderColor: '#2fbf72',
  },
  targetValue: {
    color: '#20242a',
    fontSize: 31,
    fontWeight: '900',
    maxWidth: '90%',
  },
  targetStatus: {
    bottom: 5,
    color: '#68737d',
    fontSize: 8,
    fontWeight: '900',
    position: 'absolute',
    right: 5,
  },
  solvedText: {
    color: '#0d4427',
  },
  playPane: {
    flex: 1,
    minHeight: 0,
  },
  messageBar: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderLeftColor: '#1fa7a0',
    borderLeftWidth: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  successMessage: {
    backgroundColor: '#dff8ea',
    borderLeftColor: '#2fbf72',
  },
  messageText: {
    color: '#56616b',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  successText: {
    color: '#0d4427',
  },
  numberPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  rackHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rackTitle: {
    color: '#20242a',
    fontSize: 15,
    fontWeight: '900',
  },
  rackHint: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '800',
  },
  numberRack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  resultRackFrame: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  resultRackContent: {
    alignContent: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  numberTile: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    padding: 7,
  },
  compactTile: {
    padding: 6,
  },
  givenTile: {
    backgroundColor: '#fff1a6',
  },
  resultTile: {
    backgroundColor: '#d9f5f2',
  },
  hintedTile: {
    borderColor: '#1fa7a0',
    borderWidth: 3,
    elevation: 4,
    shadowColor: '#1fa7a0',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 8,
    transform: [{ scale: 1.03 }],
  },
  disabledTile: {
    opacity: 0.55,
  },
  numberText: {
    color: '#20242a',
    fontSize: 27,
    fontWeight: '900',
    maxWidth: '96%',
  },
  compactNumberText: {
    fontSize: 22,
  },
  emptyText: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  bottomPanel: {
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexShrink: 0,
    padding: 10,
  },
  historyBlock: {
    flex: 1,
    minWidth: 0,
  },
  bottomTitle: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  historyText: {
    color: '#20242a',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  historyHit: {
    color: '#2fbf72',
  },
  historyMiss: {
    color: '#68737d',
  },
  undoButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  undoText: {
    color: '#20242a',
    fontSize: 13,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  dragGhost: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 3,
    elevation: 8,
    justifyContent: 'center',
    padding: 8,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    zIndex: 20,
  },
  dragGhostText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    maxWidth: '96%',
  },
  dialBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 36, 42, 0.32)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 30,
  },
  dialCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    width: 292,
  },
  dialTitle: {
    color: '#20242a',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  dialWheel: {
    height: 232,
    position: 'relative',
    width: 232,
  },
  operationButton: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    width: 56,
  },
  operationText: {
    color: '#ffffff',
    fontSize: 27,
    fontWeight: '900',
  },
  dialTop: {
    left: 88,
    top: 0,
  },
  dialLeft: {
    left: 0,
    top: 88,
  },
  dialRight: {
    right: 0,
    top: 88,
  },
  dialBottom: {
    bottom: 0,
    left: 88,
  },
  dialCenter: {
    alignItems: 'center',
    backgroundColor: '#eef4f7',
    borderRadius: 8,
    height: 88,
    justifyContent: 'center',
    left: 72,
    padding: 8,
    position: 'absolute',
    top: 72,
    width: 88,
  },
  dialExpression: {
    color: '#20242a',
    fontSize: 19,
    fontWeight: '900',
    maxWidth: '100%',
  },
  swapButton: {
    marginTop: 7,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  swapText: {
    color: '#147b76',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  dialError: {
    color: '#9b5b00',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 6,
    textAlign: 'center',
  },
  tutorialOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 40,
  },
  tutorialDim: {
    backgroundColor: 'rgba(0, 0, 0, 0.10)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tutorialCard: {
    backgroundColor: '#ffffff',
    borderColor: '#1fa7a0',
    borderRadius: 8,
    borderWidth: 2,
    maxWidth: 360,
    padding: 14,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  tutorialCounter: {
    color: '#147b76',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 3,
  },
  tutorialTitle: {
    color: '#20242a',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  tutorialText: {
    color: '#56616b',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
    marginTop: 7,
  },
  tutorialNext: {
    color: '#147b76',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 10,
  },
  streakOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 36, 42, 0.52)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 14,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 58,
  },
  streakCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 520,
    minHeight: 500,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    width: '100%',
  },
  streakCardActive: {
    borderColor: '#1fa7a0',
    elevation: 5,
    shadowColor: '#1fa7a0',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  streakHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  streakCloseButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  streakCloseText: {
    color: '#20242a',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 34,
  },
  streakHeaderSpacer: {
    width: 36,
  },
  streakTitle: {
    color: '#20242a',
    fontSize: 19,
    fontWeight: '900',
  },
  streakHero: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 12,
    paddingTop: 54,
  },
  streakHeroTitle: {
    color: '#20242a',
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 35,
    textAlign: 'center',
  },
  streakStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    width: '100%',
  },
  streakDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    maxWidth: 340,
    width: '100%',
  },
  streakDayItem: {
    alignItems: 'center',
  },
  streakDayLabel: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
  },
  streakDayBox: {
    alignItems: 'center',
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  streakDayBoxComplete: {
    backgroundColor: '#d9f5f2',
    borderColor: '#1fa7a0',
  },
  streakDayBoxToday: {
    borderColor: '#fff1a6',
  },
  streakDayCheck: {
    color: '#147b76',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  streakTodayText: {
    color: '#56616b',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 22,
    textAlign: 'center',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 36, 42, 0.34)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 14,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 55,
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '90%',
    maxWidth: 520,
    padding: 14,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#20242a',
    fontSize: 21,
    fontWeight: '900',
  },
  closeButton: {
    alignItems: 'center',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  closeText: {
    color: '#20242a',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  panelSection: {
    borderTopColor: '#edf2f5',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  panelTitle: {
    color: '#147b76',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  miniStat: {
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 118,
    padding: 9,
  },
  miniStatIcon: {
    color: '#147b76',
    fontSize: 13,
    fontWeight: '900',
  },
  miniStatLabel: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
  miniStatValue: {
    color: '#20242a',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 1,
  },
  settingRow: {
    alignItems: 'center',
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: 10,
  },
  settingRowGap: {
    marginTop: 7,
  },
  settingIcon: {
    color: '#147b76',
    fontSize: 21,
    fontWeight: '900',
    width: 30,
  },
  settingCopy: {
    flex: 1,
    minWidth: 0,
  },
  settingTitle: {
    color: '#20242a',
    fontSize: 14,
    fontWeight: '900',
  },
  settingSubtitle: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 1,
  },
  settingValue: {
    color: '#147b76',
    fontSize: 12,
    fontWeight: '900',
  },
  subsectionTitle: {
    color: '#68737d',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 7,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  choiceButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '23%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 54,
    minWidth: 70,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  activeChoiceButton: {
    backgroundColor: '#1fa7a0',
    borderColor: '#1fa7a0',
  },
  choiceIcon: {
    color: '#147b76',
    fontSize: 15,
    fontWeight: '900',
  },
  choiceText: {
    color: '#20242a',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 3,
  },
  activeChoiceText: {
    color: '#ffffff',
  },
  leagueSummary: {
    backgroundColor: '#d9f5f2',
    borderRadius: 8,
    marginBottom: 7,
    padding: 9,
  },
  leagueSummaryTitle: {
    color: '#20242a',
    fontSize: 14,
    fontWeight: '900',
  },
  leagueSummaryText: {
    color: '#56616b',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  leaderRow: {
    alignItems: 'center',
    borderBottomColor: '#edf2f5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 30,
  },
  userLeaderRow: {
    backgroundColor: '#fff8cf',
    borderRadius: 8,
    paddingHorizontal: 5,
  },
  leaderRank: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '900',
    width: 24,
  },
  leaderName: {
    color: '#20242a',
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  leaderScore: {
    color: '#147b76',
    fontSize: 13,
    fontWeight: '900',
  },
  userLeaderText: {
    color: '#20242a',
  },
  noteText: {
    color: '#68737d',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
    marginTop: 7,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  badgeItem: {
    backgroundColor: '#f7f8fb',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 96,
    padding: 8,
  },
  lockedBadge: {
    opacity: 0.45,
  },
  badgeIcon: {
    color: '#147b76',
    fontSize: 17,
    fontWeight: '900',
  },
  badgeTitle: {
    color: '#20242a',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 4,
  },
  badgeDescription: {
    color: '#68737d',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
    marginTop: 2,
  },
  completionOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 36, 42, 0.38)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 14,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 60,
  },
  completionCard: {
    backgroundColor: '#ffffff',
    borderColor: '#2fbf72',
    borderRadius: 8,
    borderWidth: 2,
    maxWidth: 440,
    padding: 14,
    width: '100%',
  },
  completionStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  completionActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#20242a',
    fontSize: 13,
    fontWeight: '900',
  },
});

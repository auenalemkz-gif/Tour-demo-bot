require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!TOKEN) {
  console.error('Ошибка: не задан TELEGRAM_BOT_TOKEN в переменных окружения');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

const AGENCY_NAME = 'Wonder Travel';

const TOURS = [
  { id: 'turkey', title: '🇹🇷 Турция, Анталья', price: 'от $450', duration: '7 ночей, всё включено', desc: 'Пляжный отдых на Средиземном море. Отправление из Алматы/Астаны, трансфер и страховка включены.' },
  { id: 'uae', title: '🇦🇪 ОАЭ, Дубай', price: 'от $700', duration: '5 ночей', desc: 'Шоппинг, экскурсии, пляж. Виза по прилету для граждан РК.' },
  { id: 'egypt', title: '🇪🇬 Египет, Хургада', price: 'от $500', duration: '7 ночей, всё включено', desc: 'Дайвинг, коралловые рифы, семейный отдых.' },
  { id: 'thailand', title: '🇹🇭 Таиланд, Пхукет', price: 'от $850', duration: '10 ночей', desc: 'Экзотика, острова, тайский массаж. Виза не требуется до 30 дней.' }
];

const FAQ = {
  visa: '📄 *Виза*\nДля большинства направлений (Турция, Египет, Таиланд) виза не требуется для граждан РК на срок до 30 дней. Для ОАЭ — виза по прилету. Мы поможем с документами при необходимости.',
  baggage: '🧳 *Багаж*\nВ стандартный пакет включен 1 чемодан до 20кг + ручная кладь. Дополнительный багаж оплачивается отдельно у авиакомпании.',
  insurance: '🏥 *Страховка*\nМедицинская страховка включена во все туры пакета "всё включено". Покрытие — от $30,000.',
  payment: '💳 *Оплата*\nВозможна оплата картой, переводом или частями (рассрочка до 6 месяцев через партнёрские банки).'
};

const sessions = {};

function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { step: null, booking: {} };
  return sessions[chatId];
}

function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🌍 Каталог туров', callback_data: 'menu_tours' }],
        [{ text: '📝 Оставить заявку', callback_data: 'menu_lead' }],
        [{ text: '❓ Частые вопросы', callback_data: 'menu_faq' }],
        [{ text: '📞 Связаться с менеджером', callback_data: 'menu_contact' }]
      ]
    }
  };
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sessions[chatId] = { step: null, booking: {} };
  bot.sendMessage(
    chatId,
    `👋 Добро пожаловать в *${AGENCY_NAME}*!\n\nЯ помогу подобрать тур, оформить заявку и отвечу на частые вопросы. Выберите пункт меню:`,
    { parse_mode: 'Markdown', ...mainMenu() }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Доступные команды:\n/start — главное меню\n/help — помощь');
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const session = getSession(chatId);

  bot.answerCallbackQuery(query.id);

  if (data === 'menu_tours') {
    const buttons = TOURS.map(t => [{ text: t.title, callback_data: `tour_${t.id}` }]);
    buttons.push([{ text: '⬅️ Назад', callback_data: 'menu_main' }]);
    return bot.sendMessage(chatId, '🌍 Выберите направление:', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  if (data.startsWith('tour_')) {
    const tourId = data.replace('tour_', '');
    const tour = TOURS.find(t => t.id === tourId);
    if (!tour) return;
    return bot.sendMessage(
      chatId,
      `${tour.title}\n💰 Цена: ${tour.price}\n📅 ${tour.duration}\n\n${tour.desc}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Забронировать этот тур', callback_data: `book_${tour.id}` }],
            [{ text: '⬅️ К каталогу', callback_data: 'menu_tours' }]
          ]
        }
      }
    );
  }

  if (data.startsWith('book_')) {
    const tourId = data.replace('book_', '');
    const tour = TOURS.find(t => t.id === tourId);
    session.booking = { tourTitle: tour.title };
    session.step = 'awaiting_dates';
    return bot.sendMessage(chatId, `Отлично! Вы выбрали: ${tour.title}\n\n📅 Напишите желаемые даты поездки (например: "15-22 августа"):`);
  }

  if (data === 'menu_lead') {
    session.booking = { tourTitle: 'Общая заявка (тур не выбран)' };
    session.step = 'awaiting_dates';
    return bot.sendMessage(chatId, '📝 Оформим заявку!\n\n📅 Напишите желаемые даты поездки или направление:');
  }

  if (data === 'menu_faq') {
    return bot.sendMessage(chatId, '❓ Выберите вопрос:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📄 Нужна ли виза?', callback_data: 'faq_visa' }],
          [{ text: '🧳 Провоз багажа', callback_data: 'faq_baggage' }],
          [{ text: '🏥 Страховка', callback_data: 'faq_insurance' }],
          [{ text: '💳 Способы оплаты', callback_data: 'faq_payment' }],
          [{ text: '⬅️ Назад', callback_data: 'menu_main' }]
        ]
      }
    });
  }

  if (data.startsWith('faq_')) {
    const key = data.replace('faq_', '');
    return bot.sendMessage(chatId, FAQ[key], { parse_mode: 'Markdown' });
  }

  if (data === 'menu_contact') {
    return bot.sendMessage(chatId, '📞 Наш менеджер свяжется с вами в ближайшее время! Также можно написать напрямую: @your_manager_username');
  }

  if (data === 'menu_main') {
    return bot.sendMessage(chatId, 'Главное меню:', mainMenu());
  }
});

bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const session = getSession(chatId);

  if (session.step === 'awaiting_dates') {
    session.booking.dates = msg.text;
    session.step = 'awaiting_name';
    return bot.sendMessage(chatId, '👤 Как вас зовут?');
  }

  if (session.step === 'awaiting_name') {
    session.booking.name = msg.text;
    session.step = 'awaiting_phone';
    return bot.sendMessage(chatId, '📱 Укажите номер телефона для связи:');
  }

  if (session.step === 'awaiting_phone') {
    session.booking.phone = msg.text;
    session.step = null;

    const b = session.booking;
    const summary = `✅ *Новая заявка!*\n\n🏷️ Тур: ${b.tourTitle}\n📅 Даты: ${b.dates}\n👤 Имя: ${b.name}\n📱 Телефон: ${b.phone}\n💬 Chat ID клиента: ${chatId}`;

    if (ADMIN_CHAT_ID) {
      bot.sendMessage(ADMIN_CHAT_ID, summary, { parse_mode: 'Markdown' });
    }

    bot.sendMessage(
      chatId,
      `🎉 Спасибо, ${b.name}! Заявка принята.\n\nМенеджер свяжется с вами по номеру ${b.phone} в ближайшее время.`,
      mainMenu()
    );
    session.booking = {};
    return;
  }
});

console.log(`${AGENCY_NAME} demo bot запущен...`);

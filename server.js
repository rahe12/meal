const http = require('http');
const querystring = require('querystring');

// Constants for messages
const MESSAGES = {
  english: {
    WELCOME: "CON Welcome to BMI Calculator / Murakaza neza kuri BMI Calculator\nPlease select language / Hitamo ururimi\n1. English\n2. Kinyarwanda",
    ENTER_WEIGHT: "CON Enter your weight in kilograms (e.g., 70):\n0. Back\n\nChoose a number:",
    ENTER_HEIGHT: "CON Enter your height in centimeters (e.g., 170):\n0. Back\n\nChoose a number:",
    BMI_RESULT: "CON Your BMI is %s\nCategory: %s\n1. Health tips\n0. Back\n\nChoose a number:",
    HEALTH_TIPS: {
      underweight: "CON Tips: Eat nutrient-rich foods, increase caloric intake, consult a nutritionist.\n0. Back\n\nChoose a number:",
      normal: "CON Tips: Maintain a balanced diet, exercise regularly, stay hydrated.\n0. Back\n\nChoose a number:",
      overweight: "CON Tips: Reduce caloric intake, increase physical activity, consult a doctor.\n0. Back\n\nChoose a number:",
      obese: "CON Tips: Consult a doctor, adopt a healthy diet, exercise under supervision.\n0. Back\n\nChoose a number:"
    },
    INVALID: "END Invalid input. Please try again.",
    INVALID_CHOICE: "END Invalid choice. Please try again.",
    ERROR: "END System is under maintenance. Please try again later."
  },
  kinyarwanda: {
    WELCOME: "CON Bienvenue à la Calculatrice IMC / Murakaza neza kuri BMI Calculator\nVeuillez sélectionner la langue / Hitamo ururimi\n1. Français\n2. Kinyarwanda",
    ENTER_WEIGHT: "CON Injiza ibiro byawe muri kilogarama (urugero, 70) :\n0. Subira inyuma\n\nHitamo nimero :",
    ENTER_HEIGHT: "CON Injiza uburebure bwawe muri santimetero (urugero, 170) :\n0. Subira inyuma\n\nHitamo nimero :",
    BMI_RESULT: "CON BMI yawe ni %s\nIcyiciro : %s\n1. Inama z'ubuzima\n0. Subira inyuma\n\nHitamo nimero :",
    HEALTH_TIPS: {
      underweight: "CON Inama : Fata ibiryo biryoshye, ongeramo kalori, wasanga umuganga w'imirire.\n0. Subira inyuma\n\nHitamo nimero :",
      normal: "CON Inama : Komeza kurya ibiryo biringanije, korikora imyirambere, unywe amazi ahagije.\n0. Subira inyuma\n\nHitamo nimero :",
      overweight: "CON Inama : Gukuramo kalori, ongeramo imyirambere, wasanga umuganga.\n0. Subira inyuma\n\nHitamo nimero :",
      obese: "CON Inama : Sura umuganga, tangira kurya ibiryo by'ubuzima, korikora imyirambere ufashijwe.\n0. Subira inyuma\n\nHitamo nimero :"
    },
    INVALID: "END Injiza nabi. Ongera ugerageze.",
    INVALID_CHOICE: "END Guhitamo nabi. Ongera ugerageze.",
    ERROR: "END Sisitemu iri mu bikorwa byo kuyisana. Ongera ugerageze nyuma."
  }
};

// Navigation states
const STATES = {
  WELCOME: 'welcome',
  WEIGHT: 'weight',
  HEIGHT: 'height',
  RESULT: 'result',
  TIPS: 'tips'
};

// In-memory session storage
const sessions = {};

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const parsedBody = querystring.parse(body);
        const text = (parsedBody.text || '').trim();
        const sessionId = parsedBody.sessionId || Date.now().toString();
        const phoneNumber = parsedBody.phoneNumber || 'unknown';

        console.log('Received text:', text, 'Session ID:', sessionId);

        let response = processUSSDFlow(text, sessionId);

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(response);
      } catch (error) {
        console.error('Unhandled system error:', error);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(MESSAGES.english.ERROR);
      }
    });
  } else {
    res.writeHead(200);
    res.end('USSD BMI Calculator service running.');
  }
});

function initializeSession(sessionId) {
  return {
    state: STATES.WELCOME,
    language: 'english',
    weight: null,
    height: null,
    bmi: null,
    category: null,
    navigationStack: [STATES.WELCOME],
    lastActivity: Date.now()
  };
}

function cleanupSessions() {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  
  for (const sid in sessions) {
    if (now - sessions[sid].lastActivity > THIRTY_MINUTES) {
      delete sessions[sid];
    }
  }
}

function goBack(session) {
  // Remove current state from stack
  if (session.navigationStack.length > 1) {
    session.navigationStack.pop();
    session.state = session.navigationStack[session.navigationStack.length - 1];
  } else {
    // If no previous state, go to welcome
    session.state = STATES.WELCOME;
    session.navigationStack = [STATES.WELCOME];
  }
  
  // Clear data based on current state
  switch (session.state) {
    case STATES.WELCOME:
      session.language = 'english';
      session.weight = null;
      session.height = null;
      session.bmi = null;
      session.category = null;
      break;
    case STATES.WEIGHT:
      session.weight = null;
      session.height = null;
      session.bmi = null;
      session.category = null;
      break;
    case STATES.HEIGHT:
      session.height = null;
      session.bmi = null;
      session.category = null;
      break;
    case STATES.RESULT:
      session.bmi = null;
      session.category = null;
      break;
  }
}

function navigateToState(session, newState) {
  session.state = newState;
  session.navigationStack.push(newState);
}

function calculateBMI(weight, height) {
  const heightM = height / 100;
  const bmi = (weight / (heightM * heightM)).toFixed(1);
  
  let category;
  if (bmi < 18.5) {
    category = 'underweight';
  } else if (bmi >= 18.5 && bmi < 25) {
    category = 'normal';
  } else if (bmi >= 25 && bmi < 30) {
    category = 'overweight';
  } else {
    category = 'obese';
  }
  
  return { bmi, category };
}

function getCategoryTranslation(category, language) {
  const translations = {
    english: {
      underweight: 'Underweight',
      normal: 'Normal',
      overweight: 'Overweight',
      obese: 'Obese'
    },
    kinyarwanda: {
      underweight: 'Ibiro bike',
      normal: 'Bisanzwe',
      overweight: 'Ibiro byinshi',
      obese: 'Umunani'
    }
  };
  
  return translations[language][category];
}

function processUSSDFlow(text, sessionId) {
  // Initialize or get session
  if (!sessions[sessionId]) {
    sessions[sessionId] = initializeSession(sessionId);
  }
  
  const session = sessions[sessionId];
  session.lastActivity = Date.now();
  
  // Clean up old sessions
  cleanupSessions();
  
  // Parse input - extract only numeric choices
  const inputParts = text.split('*');
  const lastInput = inputParts[inputParts.length - 1];
  
  console.log(`Session ${sessionId}: State=${session.state}, Input='${lastInput}', Stack=${JSON.stringify(session.navigationStack)}`);
  
  // Handle empty input or new session
  if (!text || text === '') {
    session.state = STATES.WELCOME;
    session.navigationStack = [STATES.WELCOME];
    return MESSAGES.english.WELCOME;
  }
  
  // Route based on current state
  switch (session.state) {
    case STATES.WELCOME:
      return handleWelcomeState(session, lastInput);
    
    case STATES.WEIGHT:
      return handleWeightState(session, lastInput);
    
    case STATES.HEIGHT:
      return handleHeightState(session, lastInput);
    
    case STATES.RESULT:
      return handleResultState(session, lastInput);
    
    case STATES.TIPS:
      return handleTipsState(session, lastInput);
    
    default:
      // Reset to welcome if unknown state
      session.state = STATES.WELCOME;
      session.navigationStack = [STATES.WELCOME];
      return MESSAGES.english.WELCOME;
  }
}

function handleWelcomeState(session, input) {
  if (input === '1') {
    session.language = 'english';
    navigateToState(session, STATES.WEIGHT);
    console.log('Language selected: English');
    return MESSAGES.english.ENTER_WEIGHT;
  } else if (input === '2') {
    session.language = 'kinyarwanda';
    navigateToState(session, STATES.WEIGHT);
    console.log('Language selected: Kinyarwanda');
    return MESSAGES.kinyarwanda.ENTER_WEIGHT;
  } else if (input === '0') {
    // Already at welcome, show welcome again
    return MESSAGES.english.WELCOME;
  } else {
    console.log('Invalid language selection:', input);
    return MESSAGES.english.INVALID;
  }
}

function handleWeightState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    goBack(session);
    console.log('Going back from weight input');
    return MESSAGES.english.WELCOME;
  }
  
  const weight = parseFloat(input);
  if (!isNaN(weight) && weight > 0 && weight <= 1000) {
    session.weight = weight;
    navigateToState(session, STATES.HEIGHT);
    console.log('Weight entered:', weight);
    return MESSAGES[lang].ENTER_HEIGHT;
  } else {
    console.log('Invalid weight input:', input);
    return MESSAGES[lang].INVALID;
  }
}

function handleHeightState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    goBack(session);
    console.log('Going back from height input');
    return MESSAGES[lang].ENTER_WEIGHT;
  }
  
  const height = parseFloat(input);
  if (!isNaN(height) && height > 0 && height <= 300) {
    session.height = height;
    
    // Calculate BMI
    const { bmi, category } = calculateBMI(session.weight, session.height);
    session.bmi = bmi;
    session.category = category;
    
    navigateToState(session, STATES.RESULT);
    console.log('Height entered:', height, 'BMI:', bmi, 'Category:', category);
    
    const categoryTranslated = getCategoryTranslation(category, lang);
    return MESSAGES[lang].BMI_RESULT.replace('%s', bmi).replace('%s', categoryTranslated);
  } else {
    console.log('Invalid height input:', input);
    return MESSAGES[lang].INVALID;
  }
}

function handleResultState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    goBack(session);
    console.log('Going back from result screen');
    return MESSAGES[lang].ENTER_HEIGHT;
  } else if (input === '1') {
    navigateToState(session, STATES.TIPS);
    console.log('Displaying health tips for category:', session.category);
    return MESSAGES[lang].HEALTH_TIPS[session.category];
  } else {
    console.log('Invalid choice on result screen:', input);
    return MESSAGES[lang].INVALID_CHOICE;
  }
}

function handleTipsState(session, input) {
  const lang = session.language;
  
  if (input === '0') {
    goBack(session);
    console.log('Going back from tips screen');
    const categoryTranslated = getCategoryTranslation(session.category, lang);
    return MESSAGES[lang].BMI_RESULT.replace('%s', session.bmi).replace('%s', categoryTranslated);
  } else {
    console.log('Invalid choice on tips screen:', input);
    return MESSAGES[lang].INVALID_CHOICE;
  }
}

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`✅ USSD BMI Calculator app is running on port ${PORT}`);
});

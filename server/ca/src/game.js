import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Game State
const player = {
  gold: 100,
  crew: 10,
  reputation: 0,
  health: 100,
  location: 'port'
};

const locations = {
  port: {
    name: 'Port Royal',
    description: 'You are in the bustling port of Port Royal.',
    actions: ['trade', 'recruit', 'sail']
  },
  sea: {
    name: 'The Open Sea',
    description: 'The waves crash against your hull. The horizon is endless.',
    actions: ['hunt', 'scout', 'return']
  }
};

function printStats() {
  console.log(`\n--- Stats ---`);
  console.log(`Gold: ${player.gold} | Crew: ${player.crew} | Rep: ${player.reputation} | HP: ${player.health}`);
  console.log(`Location: ${locations[player.location].name}`);
  console.log(`-------------\n`);
}

function gameLoop() {
  printStats();
  const loc = locations[player.location];
  console.log(loc.description);
  console.log('Actions:', loc.actions.join(', '));
  
  rl.question('> ', (answer) => {
    const action = answer.trim().toLowerCase();
    
    if (action === 'quit') {
      console.log('Fair winds, Captain.');
      process.exit(0);
    } else if (loc.actions.includes(action)) {
      handleAction(action);
      gameLoop();
    } else {
      console.log("I don't understand that order.");
      gameLoop();
    }
  });
}

function handleAction(action) {
  switch (action) {
    case 'trade':
      console.log('Trading goods...');
      const profit = Math.floor(Math.random() * 50);
      player.gold += profit;
      console.log(`Made ${profit} gold.`);
      break;
    case 'recruit':
      console.log('Recruiting crew...');
      if (player.gold >= 10) {
        player.gold -= 10;
        player.crew += 2;
        console.log('Recruited 2 new hands.');
      } else {
        console.log('Not enough gold to recruit.');
      }
      break;
    case 'sail':
      console.log('Setting sail for the open sea...');
      player.location = 'sea';
      break;
    case 'hunt':
      console.log('Hunting for ships...');
      const encounter = Math.random();
      if (encounter > 0.5) {
        console.log('Spotted a merchant vessel!');
        player.location = 'battle';
      } else {
        console.log('Nothing but fish today.');
      }
      break;
    case 'scout':
      console.log('Scanning the horizon...');
      player.reputation += 1;
      break;
    case 'return':
      console.log('Returning to port...');
      player.location = 'port';
      break;
    default:
      console.log('Unknown action.');
  }
}

console.log("Welcome to Pirate's Life!");
gameLoop();

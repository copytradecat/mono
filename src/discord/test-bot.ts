import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram, SendTransactionError } from '@solana/web3.js';
import fs from 'fs';
import { Jupiter } from '@jup-ag/api';

dotenv.config({ path: ['.env.local', '.env'] });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const testChannelId = process.env.DISCORD_TEST_CHANNEL_ID;
const testUserId = process.env.DISCORD_TEST_USER_ID;

// Load demo wallets
const demoWallets = [
  Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('test-ledger/demo_wallet_1.json', 'utf-8')))),
  Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('test-ledger/demo_wallet_2.json', 'utf-8')))),
  Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('test-ledger/demo_wallet_3.json', 'utf-8')))),
];

const connection = new Connection('http://localhost:8899', 'confirmed');

const commands = [
  new SlashCommandBuilder().setName('ct').setDescription('CopyTradeCat commands')
    .addSubcommand(subcommand => subcommand.setName('help').setDescription('Display help message'))
    .addSubcommand(subcommand => subcommand.setName('register').setDescription('Link your Discord account to the web app'))
    .addSubcommand(subcommand => subcommand.setName('wallet').setDescription('Add a wallet to trade'))
    .addSubcommand(subcommand => subcommand.setName('balance').setDescription('Show current balance of linked wallet'))
    .addSubcommand(subcommand => subcommand.setName('trade').setDescription('Place a trade')
      .addNumberOption(option => option.setName('amount').setDescription('Amount to trade').setRequired(true))
      .addStringOption(option => option.setName('token').setDescription('Token to trade').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('follow').setDescription('Follow another user')
      .addUserOption(option => option.setName('user').setDescription('User to follow').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('unfollow').setDescription('Unfollow a user')
      .addUserOption(option => option.setName('user').setDescription('User to unfollow').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('list').setDescription('Show list of traders being followed'))
    .addSubcommand(subcommand => subcommand.setName('settings').setDescription('Display current settings'))
    .addSubcommand(subcommand => subcommand.setName('set').setDescription('Update a specific setting')
      .addStringOption(option => option.setName('setting').setDescription('Setting to update').setRequired(true))
      .addStringOption(option => option.setName('value').setDescription('New value for the setting').setRequired(true)))
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), { body: commands });
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
}

async function simulateUserFlow() {
  if (!testChannelId || !testUserId) {
    console.error('Test channel ID or user ID is not defined');
    return;
  }
  const channel = await client.channels.fetch(testChannelId);
  if (!channel || !channel.isTextBased()) {
    console.error('Invalid test channel');
    return;
  }

  const userFlows = [
    { command: 'ct', options: { subcommand: 'register' } },
    { command: 'ct', options: { subcommand: 'wallet', wallet: demoWallets[0].publicKey.toBase58() } },
    { command: 'ct', options: { subcommand: 'balance' } },
    { command: 'ct', options: { subcommand: 'follow', user: testUserId } },
    { command: 'ct', options: { subcommand: 'trade', amount: 0.1, token: 'SOL' } },
    { command: 'ct', options: { subcommand: 'list' } },
    { command: 'ct', options: { subcommand: 'settings' } },
    { command: 'ct', options: { subcommand: 'set', setting: 'maxTradeAmount', value: '200' } },
    { command: 'ct', options: { subcommand: 'unfollow', user: testUserId } },
    { command: 'ct', options: { subcommand: 'help' } },
  ];

  for (const flow of userFlows) {
    await channel.send(`Simulating: /${flow.command} ${Object.entries(flow.options).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    
    // Simulate bot response
    const simulatedResponse = await simulateCommandResponse(flow.command, flow.options);
    await channel.send(`Bot response:\n${simulatedResponse}`);
    
    console.log(`Simulated command: /${flow.command}`, flow.options);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds between commands
  }

  console.log('All user flows simulated');
}

async function simulateCommandResponse(command: string, options: any): Promise<string> {
  // This function simulates the bot's response to each command
  switch (options.subcommand) {
    case 'register':
      return "Registration successful! Use the web interface to link your wallet. Your default max trade amount is set to 100. Use `.ct set maxTradeAmount <value>` to change this setting.";
    case 'wallet':
      return `Wallet linked: ${options.wallet}`;
    case 'balance':
      try {
        const balance = await connection.getBalance(new PublicKey(options.wallet));
        console.log(`Balance for wallet ${options.wallet}: ${balance / LAMPORTS_PER_SOL} SOL`);
        return `Your current balance: ${balance / LAMPORTS_PER_SOL} SOL`;
      } catch (error) {
        console.error('Error fetching balance:', error);
        return 'Failed to fetch balance';
      }
    case 'follow':
      return `You are now following user with ID: ${options.user}`;
    case 'trade':
      return simulateTrade(options.amount, options.token);
    case 'list':
      return "Traders you are following:\n1. Trader123\n2. Trader456";
    case 'settings':
      return "Your current settings:\nmaxTradeAmount: 100\ndefaultWallet: 0x1234...";
    case 'set':
      return `Setting updated: ${options.setting} = ${options.value}`;
    case 'unfollow':
      return `You have unfollowed user with ID: ${options.user}`;
    case 'help':
      return "Available commands:\n/ct register\n/ct wallet\n/ct balance\n/ct follow <user>\n/ct trade <amount> <token>\n/ct list\n/ct settings\n/ct set <setting> <value>\n/ct unfollow <user>\n/ct help";
    default:
      return "Unknown command";
  }
}

async function simulateTrade(amount: number, token: string): Promise<string> {
  try {
    const inputToken = 'SOL';
    const outputToken = token;

    // Step 1: Get the route
    const quoteResponse = await fetch('https://quote-api.jup.ag/v6/quote', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputMint: inputToken,
        outputMint: outputToken,
        amount: amount * LAMPORTS_PER_SOL,
        slippageBps: 50,
      }),
    });

    if (!quoteResponse.ok) {
      throw new Error('Failed to get quote');
    }

    const quoteData = await quoteResponse.json();

    // Step 2: Get the swap transaction
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: demoWallets[0].publicKey.toBase58(),
        wrapUnwrapSOL: true,
      }),
    });

    if (!swapResponse.ok) {
      throw new Error('Failed to get swap transaction');
    }

    const swapData = await swapResponse.json();

    // Step 3: Sign and send the transaction
    const transaction = Transaction.from(Buffer.from(swapData.swapTransaction, 'base64'));
    const signature = await connection.sendTransaction(transaction, [demoWallets[0]]);

    console.log('Transaction sent:', signature);
    return `Trade simulated: ${amount} ${inputToken} swapped for ${outputToken}. Transaction ID: ${signature}`;
  } catch (error) {
    console.error('Unexpected error:', error);
    return `Trade simulation failed: ${error.message}`;
  }
}

client.once('ready', async () => {
  console.log('Test bot is ready');
  await registerCommands();
  await simulateUserFlow();
});

client.login(process.env.DISCORD_BOT_TOKEN)
  .then(() => console.log('Bot is logged in'))
  .catch(error => console.error('Failed to log in:', error));

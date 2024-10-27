import { Client, GatewayIntentBits, ButtonInteraction, ComponentType } from 'discord.js';
import { createMockInteraction, simulateButtonInteraction } from './test/utils';
import { config } from 'dotenv';
import { handleBuyCommand } from './commands/buy';
import { handleSellCommand } from './commands/sell';
import { connectDB } from '../src/lib/mongodb';
import { defaultSettings } from '../src/components/BotSettings';

config();

const TEST_MODE = process.env.TEST_MODE || 'BUY'; // 'BUY' or 'SELL'
const TEST_TOKEN = '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr'; // POPCAT token
const TEST_USER_INDEX = process.env.TEST_USER_INDEX ? parseInt(process.env.TEST_USER_INDEX) : 0;

async function runTests() {
  try {
    await connectDB();
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });

    await client.login(process.env.DISCORD_BOT_TOKEN);
    console.log(`Logged in as ${client.user?.tag}!`);

    const mockInteraction = createMockInteraction(client, {
      mode: TEST_MODE,
      tokenAddress: TEST_TOKEN,
      settings: defaultSettings,
      userIndex: TEST_USER_INDEX  // Add this to specify which user to test
    });

    console.log(`Created mock interaction for ${TEST_MODE} operation`);

    if (TEST_MODE === 'BUY') {
      console.log('Executing handleBuyCommand');
      await handleBuyCommand(mockInteraction as any, async (collector) => {
        await simulateButtonInteraction(collector, 'amount_0');
      });
    } else {
      console.log('Executing handleSellCommand');
      await handleSellCommand(mockInteraction as any, async (collector) => {
        await simulateButtonInteraction(collector, 'percentage_0');
      });
    }

    console.log('Test completed');
    client.destroy();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTests();

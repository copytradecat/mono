import { Client, GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';
import { executeSwapsForUsers } from './commands/swap-base';
import { getTokenInfo } from '../src/services/jupiter.service';

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  try {
    const channelId = '1285735381328723968';
    const discordId = '889620302852661310';

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error('Invalid channel');
    }

    const user = await client.users.fetch(discordId);
    if (!user) {
      throw new Error('Invalid user');
    }

    const inputTokenAddress = 'So11111111111111111111111111111111111111112'; // SOL
    const outputTokenAddress = '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr'; // POPCAT

    const inputTokenInfo = await getTokenInfo(inputTokenAddress);
    const outputTokenInfo = await getTokenInfo(outputTokenAddress);

    const mockInteraction = {
      channel,
      user,
      editReply: async (content: any) => console.log('Interaction reply:', content),
    };

    const result = await executeSwapsForUsers({
      interaction: mockInteraction as any,
      connectedWallets: [{ user: { discordId }, wallet: { publicKey: 'DeV4UQkc93FPuJcR8yGj9hV2MYJ9cWrGTXEM2ohyzDEv' } }],
      selectionIndex: 0,
      isBuyOperation: true,
      inputTokenInfo,
      outputTokenInfo,
      inputTokenAddress,
      outputTokenAddress,
      initiatingUser: user,
      initiatingSettings: { slippage: 0.5 },
      initiatingEntryAmounts: [0.000001],
      channelId,
    });

    console.log('Swap result:', result);
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

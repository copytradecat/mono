import { CommandInteraction, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import User from '../../src/models/User';
import Subscription from '../../src/models/Subscriptions';

import '../../env.ts';

const interactionStates = new Map();

export const data = new SlashCommandBuilder()
  .setName('connect')
  .setDescription('Connect a wallet to this channel');

export async function handleConnect(interaction: CommandInteraction) {
  const webAppUrl = `${process.env.NEXT_PUBLIC_WEBSITE_URL}/connect?channelId=${interaction.channelId}`;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  try {
    let user = await User.findOne({ discordId: userId });
    
    if (!user) {
      const latestUser = await User.findOne().sort({ accountNumber: -1 });
      const newAccountNumber = latestUser
        ? (latestUser.accountNumber || 0) + 1
        : 1;
      user = await User.create({
        name: userId,
        discordId: userId,
        username: interaction.user.username,
        accountNumber: newAccountNumber,
      });

      await Subscription.findOneAndUpdate(
        { discordId: userId },
        {
          $setOnInsert: { level: 2 },
        },
        { upsert: true, new: true }
      );
    }

    if (user.wallets.length === 0) {
      await interaction.reply({
        content: `You don't have any wallets linked to your account. Please visit our web application to connect your wallet: ${webAppUrl}`,
        ephemeral: true
      });
      return;
    }

    const connectedWallet = user.wallets.find(wallet => wallet.connectedChannels.includes(channelId));
    const availableWallets = user.wallets.filter(wallet => !wallet.connectedChannels.includes(channelId));

    if (availableWallets.length === 0 && !connectedWallet) {
      await interaction.reply({
        content: `You have already connected all your wallets to other channels. To connect a new wallet, please add it first through our web application: ${webAppUrl}`,
        ephemeral: true
      });
      return;
    }

    let content = connectedWallet
      ? `Wallet connected: ${connectedWallet.publicKey}\n\nTo connect a different wallet, disconnect the current one, or connect a new wallet, please select from the following:`
      : "Select a wallet to connect:";

    const select = new StringSelectMenuBuilder()
      .setCustomId('select_wallet')
      .setPlaceholder('Choose a wallet to connect or disconnect')
      .addOptions(
        availableWallets.map(wallet => 
          new StringSelectMenuOptionBuilder()
            .setLabel(wallet.publicKey)
            .setValue(wallet.publicKey)
        )
      )
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Connect new wallet')
          .setValue('new_wallet')
      );

    if (connectedWallet) {
      select.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Disconnect')
          .setValue('disconnect')
      );
    }

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const reply = await interaction.reply({
      content: content,
      components: [row],
      ephemeral: true,
      fetchReply: true
    });

    interactionStates.set(interaction.id, { isAcknowledged: false, messageId: reply.id });

    const collector = interaction.channel?.createMessageComponentCollector({
      filter: (i: any) => i.customId === 'select_wallet' && i.user.id === interaction.user.id,
      time: 60000
    });

    collector?.on('collect', async (i) => {
      const selectedValue = i.values[0];
      let responseContent = '';
      
      try {
        const state = interactionStates.get(interaction.id);
        if (!state.isAcknowledged) {
          await i.deferUpdate();
          state.isAcknowledged = true;
        }

        if (selectedValue === 'disconnect') {
          if (connectedWallet) {
            await User.updateOne(
              { discordId: userId, "wallets.publicKey": connectedWallet.publicKey, "wallets.connectedChannels": channelId },
              { $set: { "wallets.$.connectedChannels": [] } }
            );
            responseContent = `Successfully disconnected wallet ${connectedWallet.publicKey} from this channel.`;
          } else {
            responseContent = "No wallet is currently connected to this channel.";
          }
        } else if (selectedValue === 'new_wallet') {
          responseContent = `To connect a new wallet, please visit: ${webAppUrl}`;
        } else {
          const selectedWalletPublicKey = selectedValue;
          
          if (connectedWallet) {
            await User.updateOne(
              { discordId: userId, "wallets.publicKey": connectedWallet.publicKey },
              { $pull: { "wallets.$.connectedChannels": channelId } }
            );
          }

          await User.updateOne(
            { discordId: userId, "wallets.publicKey": selectedWalletPublicKey },
            { $set: { "wallets.$.connectedChannels": [channelId] } }
          );

          if (connectedWallet) {
            responseContent = `Successfully connected wallet ${selectedWalletPublicKey} to this channel.\nThe previously connected wallet ${connectedWallet.publicKey} has been disconnected.`;
          } else {
            responseContent = `Successfully connected wallet ${selectedWalletPublicKey} to this channel.`;
          }
        }

        await retryEditReply(i, {
          content: responseContent,
          components: []
        });
      } catch (error) {
        console.error("Error processing wallet selection:", error);
        await retryEditReply(i, {
          content: "An error occurred while processing your request. Please try again.",
          components: []
        });
      }
    });

    collector?.on('end', async (collected) => {
      if (collected.size === 0) {
        try {
          await retryEditReply(interaction, {
            content: 'Wallet selection timed out. Please try again.',
            components: []
          });
        } catch (error) {
          console.error("Error updating timed-out interaction:", error);
        }
      }
      interactionStates.delete(interaction.id);
    });

  } catch (error) {
    console.error("Error in connect command:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "An error occurred while processing your request.", ephemeral: true });
    }
  }
}

async function retryEditReply(interaction, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (!options.content && !options.embeds && !options.components) {
        console.warn("Attempted to send an empty message. Skipping edit.");
        return;
      }
      await interaction.editReply(options);
      return;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
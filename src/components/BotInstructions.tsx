import React from 'react';
import Link from 'next/link';
import dotenv from 'dotenv';

dotenv.config();

export default function BotInstructions() {
  const botInviteLink = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=2147560512&scope=bot`;

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-4">
          Add CopyTradeCat Bot to Your Server
        </h1>
        <ol className="list-decimal list-inside space-y-4">
          <li>
            Click the link below to invite the bot to your server:
            <ul>
              <li className="ml-8">
                  <a
                    className="text-blue-500 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={botInviteLink}
                  >
                    Invite CopyTradeCat Bot
                  </a>
              </li>
            </ul>
          </li>
          <li>Select the server you want to add the bot to from the dropdown menu.</li>
          <li>Review the permissions and click "Authorize".</li>
          <li>Complete any additional verification steps if prompted.</li>
          <li>
            Once added, use the command{' '}
            <code className="bg-gray-200 px-1 rounded">/ct setup</code> in the channel
            where you want the bot to operate.
          </li>
          <li>
            After setup, members can use{' '}
            <code className="bg-gray-200 px-1 rounded">/ct register</code> to start using
            the bot.
          </li>
          <li>
            If you need help, join our support server:
            <ul>
              <li className="ml-8">
                  <a
                    className="text-blue-500 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://discord.gg/sAVYWMkyZz"
                  >
                    Support Server
                  </a>
              </li>
            </ul>
          </li>
        </ol>      
      </div>
    </>
  );
}

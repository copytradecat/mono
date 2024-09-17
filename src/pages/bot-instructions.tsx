import React from 'react';
import Link from 'next/link';
import BotSettings from '../components/BotSettings';

export default function BotInstructions() {
  const botInviteLink = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&permissions=2147560512&scope=bot`;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Add CopyTradeCat Bot to Your Server</h1>
      <ol className="list-decimal list-inside space-y-4">
        <li>Click the link below to invite the bot to your server:</li>
        <li className="ml-8">
          <Link href={botInviteLink} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
            Invite CopyTradeCat Bot
          </Link>
        </li>
        <li>Select the server you want to add the bot to from the dropdown menu.</li>
        <li>Review the permissions and click "Authorize".</li>
        <li>Complete any additional verification steps if prompted.</li>
        <li>Once added, the bot will be available in your server.</li>
        <li>Use the command <code className="bg-gray-200 px-1 rounded">.ct help</code> to see available commands.</li>
      </ol>
      
      <h2 className="text-2xl font-bold mt-8 mb-4">Configuring Bot Settings</h2>
      <p className="mb-4">You can configure bot settings using Discord commands or through this web interface:</p>
      
      <h3 className="text-xl font-semibold mb-2">Using Discord Commands</h3>
      <ul className="list-disc list-inside space-y-2 mb-4">
        <li>Use <code className="bg-gray-200 px-1 rounded">.ct settings</code> to view current settings</li>
        <li>Use <code className="bg-gray-200 px-1 rounded">.ct set &lt;setting&gt; &lt;value&gt;</code> to update a setting</li>
      </ul>
      
      <h3 className="text-xl font-semibold mb-2">Using Web Interface</h3>
      <BotSettings />
      
      <p className="mt-8">
        For more information on how to use the bot, check out our{' '}
        <Link href="/docs" className="text-blue-500 hover:underline">
          documentation
        </Link>
        .
      </p>
    </div>
  );
}

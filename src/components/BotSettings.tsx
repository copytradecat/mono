import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Settings {
  maxTradeAmount: number;
  // Add other settings as needed
}

export default function BotSettings() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    if (session) {
      fetchSettings();
    }
  }, [session]);

  const fetchSettings = async () => {
    const response = await fetch('/api/bot-settings');
    if (response.ok) {
      const data = await response.json();
      setSettings(data.settings);
    }
  };

  const updateSetting = async (setting: keyof Settings, value: number | string) => {
    const response = await fetch('/api/bot-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setting, value }),
    });

    if (response.ok) {
      fetchSettings();
    }
  };

  if (!settings) return <div>Loading settings...</div>;

  return (
    <div>
      <h2>Bot Settings</h2>
      <div>
        <label>Max Trade Amount: </label>
        <input 
          type="number" 
          value={settings.maxTradeAmount} 
          onChange={(e) => updateSetting('maxTradeAmount', parseInt(e.target.value, 10))}
        />
      </div>
      {/* Add more settings as needed */}
    </div>
  );
}

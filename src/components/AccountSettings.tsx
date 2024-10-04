import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';

interface Settings {
  maxTradeAmount: number;
}

export default function AccountSettings() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [maxTradeAmount, setMaxTradeAmount] = useState('');

  const fetchSettings = useCallback(async () => {
    try {
      const response = await axios.get('/api/bot-settings');
      const data = response.data.settings;
      setSettings(data);
      setMaxTradeAmount(data.maxTradeAmount?.toString() || '');
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchSettings();
    }
  }, [session, fetchSettings]);

  const handleSaveSettings = async () => {
    const response = await fetch('/api/update-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxTradeAmount: parseFloat(maxTradeAmount) }),
    });

    if (response.ok) {
      alert('Settings updated successfully');
      fetchSettings();
    } else {
      alert('Failed to update settings');
    }
  };

  if (!session) {
    return <div>Please sign in to manage your account settings.</div>;
  }

  return (
    <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
      <h2 className="text-2xl font-bold mb-4">Account Settings</h2>
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="maxTradeAmount">
          Max Trade Amount
        </label>
        <input
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          id="maxTradeAmount"
          type="number"
          value={maxTradeAmount}
          onChange={(e) => setMaxTradeAmount(e.target.value)}
        />
      </div>
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        onClick={handleSaveSettings}
      >
        Save Settings
      </button>
    </div>
  );
}

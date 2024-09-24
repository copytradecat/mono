import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Settings {
  slippage: number;
  slippageType: 'fixed' | 'dynamic';
  smartMevProtection: 'fast' | 'secure';
  setSpeed: 'default' | 'auto';
  priorityFee: number;
  briberyAmount: number; // Not used in transaction, but kept for bot logic
  entryAmounts: number[]; // Not used in transaction, but kept for bot logic
  exitPercentages: number[]; // Not used in transaction, but kept for bot logic
  wrapUnwrapSOL: boolean;
  useSharedAccounts: boolean;
  useTokenLedger: boolean;
}

const defaultSettings: Settings = {
  slippage: 3.0,
  slippageType: 'fixed',
  smartMevProtection: 'secure',
  setSpeed: 'default',
  priorityFee: 0.01,
  briberyAmount: 0.01,
  entryAmounts: [0.05, 0.1, 0.24, 0.69, 0.8, 1],
  exitPercentages: [24, 33, 100],
  wrapUnwrapSOL: true,
  useSharedAccounts: true,
  useTokenLedger: true
};

export default function BotSettings() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [fetchedSettings, setFetchedSettings] = useState<Settings>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (session) {
      fetchSettings();
    }
  }, [session]);

  const fetchSettings = async () => {
    const response = await fetch('/api/bot-settings');
    if (response.ok) {
      const data = await response.json();
      setSettings({ ...defaultSettings, ...data.settings });
      setFetchedSettings({ ...defaultSettings, ...data.settings });
    }
  };

  const updateSetting = (setting: keyof Settings, value: any) => {
    setSettings(prev => ({ ...prev, [setting]: value }));
  };

  const handleSaveSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/bot-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      const data = await response.json();
      setFetchedSettings(data.settings);
      alert('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  if (!settings) return <div>Loading settings...</div>;

  return (
    <div className="p-4 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Bot Settings</h2>
      <div>
        {settings ? 
        (<table>
          <tbody>
            <tr>
              <td>Saved Settings</td>
              <td>Unsaved Settings</td>
            </tr>
            <tr>
              <td><pre className="bg-gray-100 p-2 rounded">
              {JSON.stringify(fetchedSettings, null, 2)}</pre></td>
              <td><pre className="bg-gray-100 p-2 rounded">
              {JSON.stringify(settings, null, 2)}</pre></td>
            </tr>
          </tbody>
        </table>) : ''}
        <h3 className="text-xl font-semibold mb-2">Slippage Type</h3>
          <div>
            <button
              onClick={() => updateSetting('slippageType', 'fixed')}
              className={`mr-2 px-4 py-2 rounded ${settings.slippageType === 'fixed' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Fixed
            </button>
            <button
              onClick={() => updateSetting('slippageType', 'dynamic')}
              className={`px-4 py-2 rounded ${settings.slippageType === 'dynamic' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Dynamic
            </button>
          </div>
          {settings.slippageType === 'fixed' && (
            <>
              <h3 className="text-xl font-semibold mt-4 mb-2">Slippage (%)</h3>
              <input
                type="number"
                value={settings.slippage}
                onChange={(e) => updateSetting('slippage', parseFloat(e.target.value))}
                className="w-full p-2 border rounded"
              />
            </>
          )}
        <h3 className="text-xl font-semibold mt-4 mb-2">Smart-MEV Protection</h3>
        <div>
          <button
            onClick={() => updateSetting('smartMevProtection', 'fast')}
            className={`mr-2 px-4 py-2 rounded ${settings.smartMevProtection === 'fast' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Fast
          </button>
          <button
            onClick={() => updateSetting('smartMevProtection', 'secure')}
            className={`px-4 py-2 rounded ${settings.smartMevProtection === 'secure' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Secure
          </button>
        </div>
        <h3 className="text-xl font-semibold mt-4 mb-2">Set Speed</h3>
        <div>
          <button
            onClick={() => updateSetting('setSpeed', 'default')}
            className={`mr-2 px-4 py-2 rounded ${settings.setSpeed === 'default' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Default
          </button>
          <button
            onClick={() => updateSetting('setSpeed', 'auto')}
            className={`px-4 py-2 rounded ${settings.setSpeed === 'auto' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Auto
          </button>
        </div>
        <h3 className="text-xl font-semibold mt-4 mb-2">Priority Fee (SOL)</h3>
        <input
          type="number"
          value={settings.priorityFee}
          onChange={(e) => updateSetting('priorityFee', parseFloat(e.target.value))}
          className="w-full p-2 border rounded"
        />
        <h3 className="text-xl font-semibold mt-4 mb-2">Wrap/Unwrap SOL</h3>
        <input
          type="checkbox"
          checked={settings.wrapUnwrapSOL}
          onChange={(e) => updateSetting('wrapUnwrapSOL', e.target.checked)}
          className="mr-2"
        />
        <label>Automatically wrap/unwrap SOL</label>
        <h3 className="text-xl font-semibold mt-4 mb-2">Use Shared Accounts</h3>
        <input
          type="checkbox"
          checked={settings.useSharedAccounts}
          onChange={(e) => updateSetting('useSharedAccounts', e.target.checked)}
          className="mr-2"
        />
        <label>Use shared accounts for better efficiency</label>
        <h3 className="text-xl font-semibold mt-4 mb-2">Use Token Ledger</h3>
        <input
          type="checkbox"
          checked={settings.useTokenLedger}
          onChange={(e) => updateSetting('useTokenLedger', e.target.checked)}
          className="mr-2"
        />
        <label>Use token ledger for tracking</label>
        <h3 className="text-xl font-semibold mt-4 mb-2">Bribery Amount (SOL)</h3>
        <input
          type="number"
          value={settings.briberyAmount}
          onChange={(e) => updateSetting('briberyAmount', parseFloat(e.target.value))}
          className="w-full p-2 border rounded"
        />
        <h3 className="text-xl font-semibold mt-4 mb-2">Entry Amounts</h3>
        <div className="flex flex-wrap">
          {(settings.entryAmounts || []).map((value, index) => (
            <input
              key={index}
              type="number"
              value={value}
              onChange={(e) => {
                const newEntryAmounts = [...(settings.entryAmounts || [])];
                newEntryAmounts[index] = parseFloat(e.target.value);
                updateSetting('entryAmounts', newEntryAmounts);
              }}
              className="w-1/6 p-2 border rounded mr-2 mb-2"
            />
          ))}
        </div>
        <h3 className="text-xl font-semibold mt-4 mb-2">Exit Percentages</h3>
        <div className="flex flex-wrap">
          {(settings.exitPercentages || []).map((value, index) => (
            <input
              key={index}
              type="number"
              value={value}
              onChange={(e) => {
                const newExitPercentages = [...(settings.exitPercentages || [])];
                newExitPercentages[index] = parseFloat(e.target.value);
                updateSetting('exitPercentages', newExitPercentages);
              }}
              className="w-1/6 p-2 border rounded mr-2 mb-2"
            />
          ))}
        </div>
        <button
          onClick={handleSaveSettings}
          disabled={isLoading}
          className="mt-6 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          {isLoading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

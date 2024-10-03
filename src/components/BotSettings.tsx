import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export interface Settings {
  slippage: number;
  slippageType: 'fixed' | 'dynamic';
  smartMevProtection: 'fast' | 'secure'; // Not implemented
  priorityFee: number | 'auto'; 
  transactionSpeed: 'medium' | 'high' | 'veryHigh' | 'custom' | 'auto';
  // bribery removed, not implemented
  entryAmounts: number[]; // For bot logic, not used in transaction
  exitPercentages: number[]; // For bot logic, not used in transaction
  wrapUnwrapSOL: boolean;
}

export const defaultSettings: Settings = {
  slippage: 300,
  slippageType: 'fixed',
  smartMevProtection: 'secure',
  transactionSpeed: 'medium',
  priorityFee: 'auto',
  entryAmounts: [0.05, 0.1, 0.42069, 1, 2.4, 10],
  exitPercentages: [10, 20, 50, 100],
  wrapUnwrapSOL: true,
};

export default function BotSettings() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [fetchedSettings, setFetchedSettings] = useState<Settings>();
  const [isLoading, setIsLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    const response = await fetch('/api/bot-settings');
    if (response.ok) {
      const data = await response.json();
      setSettings({ ...defaultSettings, ...data.settings });
      setFetchedSettings({ ...defaultSettings, ...data.settings });
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchSettings();
    }
  }, [session, fetchSettings]);

  const updateSetting = (key, value) => {
    setSettings((prevSettings) => ({
      ...prevSettings,
      [key]: value,
    }));
  };

  const validateAndSaveSettings = () => {
    const isValidEntryAmounts = isIncreasingArray(settings.entryAmounts);
    const isValidExitPercentages = isIncreasingArray(settings.exitPercentages);

    if (!isValidEntryAmounts || !isValidExitPercentages) {
      alert('Entry Amounts and Exit Percentages must be in increasing order.');
      return;
    }

    // Save settings
  };

  const isIncreasingArray = (arr) => {
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] >= arr[i + 1]) {
        return false;
      }
    }
    return true;
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

  return (
    <div className="p-4 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Bot Settings</h2>
      <div>
        <table>
          <tbody>
            <tr>
              <td>Saved Settings</td>
              <td>Unsaved Settings</td>
            </tr>
            <tr>
              <td>
                <pre className="bg-gray-100 p-2 rounded">
                  {JSON.stringify(fetchedSettings, null, 2)}
                </pre>
              </td>
              <td>
                <pre className="bg-gray-100 p-2 rounded">
                  {JSON.stringify(settings, null, 2)}
                </pre>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Slippage Type */}
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
              <h3 className="text-xl font-semibold mt-4 mb-2">Slippage Bips (100 bips = 1% slippage)</h3>
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
        <h3 className="text-xl font-semibold mt-4 mb-2">Transaction Speed</h3>
        <div>
          {['medium', 'high', 'veryHigh'].map((speed) => (
            <button
              key={speed}
              onClick={() => {
                updateSetting('transactionSpeed', speed as Settings['transactionSpeed']);
                if (speed !== 'custom') {
                  updateSetting('priorityFee', 'auto');
                }
              }}
              className={`mr-2 px-4 py-2 rounded ${
                settings.transactionSpeed === speed ? 'bg-blue-500 text-white' : 'bg-gray-200'
              }`}
            >
              {speed.charAt(0).toUpperCase() + speed.slice(1)}
            </button>
          ))}
        </div>
        {settings.transactionSpeed === 'custom' && (
          <>
            <h3 className="text-xl font-semibold mt-4 mb-2">Custom Priority Fee (in SOL)</h3>
            <input
              type="number"
              value={settings.priorityFee === 'auto' ? '' : settings.priorityFee}
              onChange={(e) => updateSetting('priorityFee', parseFloat(e.target.value))}
              className="w-full p-2 border rounded"
            />
          </>
        )}
        <h3 className="text-xl font-semibold mt-4 mb-2">Wrap/Unwrap SOL</h3>
        <input
          type="checkbox"
          checked={settings.wrapUnwrapSOL}
          onChange={(e) => updateSetting('wrapUnwrapSOL', e.target.checked)}
          className="mr-2"
        />
        <label>Automatically wrap/unwrap SOL</label>
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
          onClick={validateAndSaveSettings}
          disabled={isLoading}
          className="mt-6 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          {isLoading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
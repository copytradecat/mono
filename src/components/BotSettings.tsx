import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import NextLink from 'next/link';

export interface Settings {
  slippage: number;
  slippageType: 'fixed' | 'dynamic';
  smartMevProtection: 'fast' | 'secure' | null;
  transactionSpeed: 'medium' | 'high' | 'veryHigh' | 'custom' | 'auto';
  priorityFee: number | 'auto';
  entryAmounts: number[];
  exitPercentages: number[];
  wrapUnwrapSOL: boolean;
}

export const defaultSettings: Settings = {
  slippage: 300, // 3%
  slippageType: 'dynamic',
  smartMevProtection: 'secure',
  transactionSpeed: 'medium',
  priorityFee: 'auto',
  entryAmounts: [0.01, 0.05, 0.1, 0.5, 1],
  exitPercentages: [10, 20, 50, 75, 100],
  wrapUnwrapSOL: true,
};

interface BotSettingsProps {
  walletPublicKey?: string | null;
  initialSettings?: Settings;
  onSave?: (settings: Settings) => void;
  presetName?: string;
}

export default function BotSettings({ walletPublicKey, initialSettings, onSave, presetName }: BotSettingsProps) {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unSaved, setUnSaved] = useState(false);
  const [presets, setPresets] = useState<{ _id: string; name: string; settings: Settings }[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [currentPresetName, setCurrentPresetName] = useState(presetName || 'Custom');
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/bot-settings', {
        params: { walletPublicKey }
      });
      setSettings(response.data.settings);
      setSavedSettings(response.data.settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setError('Failed to load settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [session, walletPublicKey]);

  const fetchPresets = useCallback(async () => {
    if (!session) return;
    try {
      const response = await axios.get('/api/presets');
      setPresets(response.data);
    } catch (error) {
      console.error('Error fetching presets:', error);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      fetchSettings();
      fetchPresets();
    }
  }, [session, fetchSettings, fetchPresets]);

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
      setSavedSettings(initialSettings);
      setUnSaved(false);
      setIsLoading(false);
    } else {
      setSettings(defaultSettings);
      setSavedSettings(defaultSettings);
      setIsLoading(false);
    }
  }, [initialSettings]);

  const handlePresetChange = (presetId: string) => {
    const selectedPreset = presets.find(preset => preset._id === presetId);
    if (selectedPreset) {
      setSettings(selectedPreset.settings);
      setSelectedPresetId(presetId);
      setCurrentPresetName(selectedPreset.name);
      setUnSaved(true);
    }
  };
  const updateSetting = (key: keyof Settings, value: any) => {
    setSettings((prevSettings: Settings | null) => {
      if (prevSettings === null) {
        return { [key]: value } as Settings;
      }
      const newSettings = { ...prevSettings, [key]: value };
      setUnSaved(true);
      return newSettings;
    });
    if(JSON.stringify(initialSettings,null,2)!==JSON.stringify(settings,null,2)){
      setUnSaved(true);
    } else {
      setUnSaved(false);
    }
  };
  const validateAndSaveSettings = () => {
    if (!settings) {
      alert('Settings are not available.');
      return;
    }

    const isValidEntryAmounts = isIncreasingArray(settings.entryAmounts);
    const isValidExitPercentages = isIncreasingArray(settings.exitPercentages);

    if (!isValidEntryAmounts || !isValidExitPercentages) {
      alert('Entry Amounts and Exit Percentages must be in increasing order.');
      return;
    }

    // Save settings
    handleSaveSettings();
  };

  const isIncreasingArray = (arr: number[]) => {
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
      if (onSave) {
        onSave(settings!);
      } else {
        const response = await axios.post('/api/bot-settings', {
          settings,
          walletPublicKey,
          presetId: selectedPresetId
        });

        if (response.status === 200) {
          setSavedSettings(settings);
          alert('Settings saved successfully');
          setUnSaved(false);
          setCurrentPresetName(selectedPresetId ? presets.find(p => p._id === selectedPresetId)?.name || 'Custom' : 'Custom');
        } else {
          throw new Error('Failed to save settings');
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div>Loading settings...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!settings) {
    return <div>No settings available.</div>;
  }

  return (
    <div className="p-4 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">
        Bot Settings {walletPublicKey ? `for ${walletPublicKey.slice(0, 6)}...${walletPublicKey.slice(-4)}` : ''}
      </h2>
      <p className="mb-4">Use Preset:
        &nbsp;
        <select
          value={selectedPresetId || ''}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="mb-4 p-2 border rounded"
        >
          <option value="">Custom</option>
          {presets.map((preset) => (
            <option key={preset._id} value={preset._id}>{preset.name}</option>
          ))}
        </select>
        &nbsp;
        <NextLink href="/presets">
          <button className="bg-green-500 text-white px-4 py-2 rounded mt-4">
            Manage Presets
          </button>
        </NextLink>&nbsp;
        {currentPresetName !== 'Custom' && `${currentPresetName} Preset Settings Prefilled Below.`}
        {unSaved && (
          <div className="mb-4">
            <p className="text-red-500">Unsaved changes detected. Please save or discard them.</p>
          </div>
        )}
      </p>
      <div>
        <h3 className="text-xl font-semibold mt-4 mb-2">Entry Amounts</h3>
        <div className="flex flex-wrap">
          {(settings.entryAmounts || []).map((value, index) => (
            <input
              key={index}
              type="number"
              value={value}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              onChange={(e) => {
                const newEntryAmounts = [...(settings.entryAmounts || [])];
                newEntryAmounts[index] = parseFloat(e.target.value);
                updateSetting('entryAmounts', newEntryAmounts);
              }}
              className="w-1/6 p-2 border rounded mr-2 mb-2"
              style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', margin: '0' }}
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
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              onChange={(e) => {
                const newExitPercentages = [...(settings.exitPercentages || [])];
                newExitPercentages[index] = parseFloat(e.target.value);
                updateSetting('exitPercentages', newExitPercentages);
              }}
              className="w-1/6 p-2 border rounded mr-2 mb-2"
              style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', margin: '0' }}
            />
          ))}
        </div>
        <br/>
        <details className="mt-4">
          <summary className="text-xl font-semibold cursor-pointer">Advanced Settings</summary>
          <div className="mt-2">
            <h3 className="text-lg font-semibold mb-2">Slippage Type</h3>
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
                <h3 className="text-lg font-semibold mt-4 mb-2">Slippage Bips (100 bips = 1% slippage)</h3>
                <input
                  type="number"
                  value={settings.slippage || ''}
                  onChange={(e) => updateSetting('slippage', parseFloat(e.target.value))}
                  className="w-full p-2 border rounded"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', margin: '0' }}
                />
              </>
            )}
            <h3 className="text-lg font-semibold mt-4 mb-2">Smart-MEV Protection</h3>
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
            <h3 className="text-lg font-semibold mt-4 mb-2">Transaction Speed</h3>
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
                <h3 className="text-lg font-semibold mt-4 mb-2">Custom Priority Fee (in SOL)</h3>
                <input
                  type="number"
                  value={settings.priorityFee === 'auto' ? '' : settings.priorityFee?.toString() ?? ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : parseFloat(e.target.value);
                    updateSetting('priorityFee', value);
                  }}
                  className="w-full p-2 border rounded"
                />
              </>
            )}
            <h3 className="text-lg font-semibold mt-4 mb-2">Wrap/Unwrap SOL</h3>
            <input
              type="checkbox"
              checked={settings.wrapUnwrapSOL || true}
              onChange={(e) => updateSetting('wrapUnwrapSOL', e.target.checked)}
              className="mr-2"
            />
            <label>Automatically wrap/unwrap SOL</label>
          </div>
        </details>
      </div>
      {unSaved && (
        <>
          <div className="mb-4 mt-4">
            <p className="text-red-500">Unsaved changes detected. Please save or discard them.</p>
          </div>
          <table className="mb-4">
            <tbody>
              <tr>
                <td>Current Settings</td>
                <td>Unsaved Settings</td>
              </tr>
              <tr>
                <td>
                  <pre className="bg-gray-100 p-2 rounded">
                    {JSON.stringify(savedSettings, null, 2)}
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
          <button
            onClick={validateAndSaveSettings}
            className="bg-green-500 text-white px-4 py-2 rounded mt-4"
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </>
      )}<br/><br/><br/><br/><br/>
    </div>
  );
}
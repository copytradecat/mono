import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings } from './BotSettings';
import BotSettings from './BotSettings';

interface Preset {
  _id: string;
  name: string;
  settings: Settings;
}

export default function PresetManager() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

  useEffect(() => {
    fetchPresets();
  }, []);

  const fetchPresets = async () => {
    try {
      const response = await axios.get('/api/presets');
      setPresets(response.data);
    } catch (error) {
      console.error('Error fetching presets:', error);
    }
  };

  const handleCreatePreset = async () => {
    try {
      const response = await axios.post('/api/presets', { name: newPresetName, settings: {} });
      setPresets([...presets, response.data]);
      setNewPresetName('');
    } catch (error) {
      console.error('Error creating preset:', error);
    }
  };

  const handleUpdatePreset = async (updatedSettings: Settings) => {
    if (!selectedPreset) return;
    try {
      const response = await axios.put(`/api/presets/${selectedPreset._id}`, { settings: updatedSettings });
      setPresets(presets.map(preset => preset._id === selectedPreset._id ? response.data : preset));
      setSelectedPreset(null);
    } catch (error) {
      console.error('Error updating preset:', error);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      await axios.delete(`/api/presets/${presetId}`);
      setPresets(presets.filter(preset => preset._id !== presetId));
    } catch (error) {
      console.error('Error deleting preset:', error);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Preset Manager</h2>
      <div className="mb-4">
        <input
          type="text"
          value={newPresetName}
          onChange={(e) => setNewPresetName(e.target.value)}
          placeholder="New preset name"
          className="mr-2 p-2 border rounded"
        />
        <button onClick={handleCreatePreset} className="bg-green-500 text-white px-4 py-2 rounded">Create Preset</button>
      </div>
      <ul className="mb-4">
        {presets.map((preset) => (
          <li key={preset._id} className="mb-2">
            {preset.name}
            <button onClick={() => setSelectedPreset(preset)} className="ml-2 bg-blue-500 text-white px-2 py-1 rounded text-sm">Edit</button>
            <button onClick={() => handleDeletePreset(preset._id)} className="ml-2 bg-red-500 text-white px-2 py-1 rounded text-sm">Delete</button>
          </li>
        ))}
      </ul>
      {selectedPreset && (
        <div>
          <h3 className="text-xl font-bold mb-2">Edit Preset: {selectedPreset.name}</h3>
          <BotSettings initialSettings={selectedPreset.settings} onSave={handleUpdatePreset} />
        </div>
      )}
    </div>
  );
}
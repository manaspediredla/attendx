import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { PlusIcon, PencilSquareIcon, TrashIcon, MapPinIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function LocationManagement() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '', radius_meters: 250 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const searchTimeoutRef = useRef(null);

  const fetch = () => {
    api.get('/admin/locations').then(res => setLocations(res.data || []))
      .catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editItem) { await api.put(`/admin/locations/${editItem.id}`, form); toast.success('Updated'); }
      else { await api.post('/admin/locations', form); toast.success('Added'); }
      setShowModal(false); setEditItem(null);
      resetForm();
      fetch();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const resetForm = () => {
    setForm({ name: '', latitude: '', longitude: '', radius_meters: 250 });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this location?')) return;
    try { await api.delete(`/admin/locations/${id}`); toast.success('Deleted'); fetch(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const detectCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported in this browser');
      return;
    }

    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude.toFixed(6);
        const longitude = pos.coords.longitude.toFixed(6);
        setForm(prev => ({ ...prev, latitude, longitude }));
        toast.success('Current location detected');
        setDetecting(false);
      },
      (err) => {
        toast.error(err.message || 'Unable to detect location. Allow GPS permission.');
        setDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const searchLocation = (query) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        toast.error('Location search failed');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const selectSearchResult = (result) => {
    const latitude = parseFloat(result.lat).toFixed(6);
    const longitude = parseFloat(result.lon).toFixed(6);
    const label = result.display_name?.split(',')[0] || result.name || 'Selected location';

    setForm(prev => ({
      ...prev,
      latitude,
      longitude,
      name: prev.name || label,
    }));
    setSearchQuery(result.display_name || label);
    setSearchResults([]);
    toast.success('Location selected');
  };

  const openAddModal = () => {
    setEditItem(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (loc) => {
    setEditItem(loc);
    setForm({
      name: loc.name,
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      radius_meters: loc.radius_meters,
    });
    setSearchQuery('');
    setSearchResults([]);
    setShowModal(true);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100">📍 GPS Locations</h1>
        <button onClick={openAddModal} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Add Location
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {locations.map(loc => (
          <div key={loc.id} className="glass-card p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10  flex items-center justify-center shrink-0">
                <MapPinIcon className="w-5 h-5 text-emerald-600 " />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-surface-900 dark:text-surface-100 truncate">{loc.name}</h3>
                <span className={`badge ${loc.is_active ? 'badge-full' : 'badge-absent'} mt-1`}>{loc.is_active ? 'Active' : 'Disabled'}</span>
              </div>
            </div>
            <div className="space-y-1 text-sm text-surface-600 dark:text-surface-400  mb-4">

              <p>📐 Lat: {loc.latitude}, Lng: {loc.longitude}</p>
              <p>🎯 Radius: {loc.radius_meters}m</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEditModal(loc)} className="btn-secondary btn-sm flex-1">
                <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => handleDelete(loc.id)} className="btn-danger btn-sm">
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {locations.length === 0 && (
          <div className="col-span-full text-center py-12 text-surface-500">
            <MapPinIcon className="w-12 h-12 mx-auto mb-3 text-surface-300" />
            <p>No GPS locations configured. Add your campus locations.</p>
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Location' : 'Add Location'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300  mb-1.5">Location Name</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="e.g., Hyderabad Campus" required />
          </div>


          <div className="rounded-xl border border-border  p-4 space-y-3 bg-surface-50/50 bg-surface-800/30">
            <p className="text-sm font-semibold text-surface-700 dark:text-surface-200 ">Find coordinates</p>

            <div className="relative">
              <label className="block text-xs font-medium text-surface-400  mb-1.5">Search place or address</label>
              <div className="relative">
                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => searchLocation(e.target.value)}
                  className="input-field pl-9"
                  placeholder="e.g., Symbiosis Pune, Main Building"
                />
              </div>
              {searching && <p className="text-xs text-surface-500 mt-1">Searching...</p>}
              {searchResults.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border  bg-card dark:bg-surface-900 shadow-lg">
                  {searchResults.map((result) => (
                    <li key={result.place_id}>
                      <button
                        type="button"
                        onClick={() => selectSearchResult(result)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 dark:hover:bg-brand-900/20 text-surface-700 dark:text-surface-300 "
                      >
                        {result.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={detectCurrentLocation}
              disabled={detecting}
              className="btn-secondary w-full"
            >
              {detecting ? 'Detecting location...' : '📍 Use My Current Location'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300  mb-1.5">Latitude</label>
              <input type="number" step="any" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300  mb-1.5">Longitude</label>
              <input type="number" step="any" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} className="input-field" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300  mb-1.5">Radius (meters)</label>
            <select value={form.radius_meters} onChange={e => setForm({ ...form, radius_meters: parseInt(e.target.value) })} className="input-field">
              <option value="100">100m (Tight)</option>
              <option value="250">250m (Standard)</option>
              <option value="500">500m (Wide)</option>
            </select>
          </div>
          <button type="submit" className="btn-primary w-full">{editItem ? 'Update' : 'Add'} Location</button>
        </form>
      </Modal>
    </motion.div>
  );
}

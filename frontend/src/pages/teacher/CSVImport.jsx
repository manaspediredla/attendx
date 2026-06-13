import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { CloudArrowUpIcon, CheckCircleIcon, ExclamationTriangleIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';

export default function CSVImport() {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [csvConfig, setCsvConfig] = useState({ required_fields: [] });

  useEffect(() => {
    api.get('/teacher/csv-config').then(r => setCsvConfig(r.data)).catch(() => {});
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith('.csv')) setFile(f);
    else toast.error('Only CSV files are accepted');
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/teacher/import-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      toast.success(`Imported ${res.data.success_count} students!`);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.errors) setResult(errData);
      toast.error(errData?.error || 'Import failed');
    } finally { setLoading(false); }
  };

  const requiredFields = csvConfig.required_fields?.length
    ? csvConfig.required_fields
    : ['id', 'full_name', 'email', 'gender', 'college_name', 'city_name', 'department', 'section'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-6">📤 CSV Student Import</h1>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`glass-card p-12 text-center cursor-pointer transition-all duration-200 ${dragOver ? 'border-surface-400 bg-brand-50/50 dark:bg-brand-900/10' : ''}`}
        onClick={() => document.getElementById('csv-input').click()}
      >
        <CloudArrowUpIcon className="w-16 h-16 mx-auto text-surface-300 mb-4" />
        <p className="text-lg font-semibold text-surface-700 dark:text-surface-200  mb-2">
          {file ? file.name : 'Drag & Drop CSV File'}
        </p>
        <p className="text-sm text-surface-500">
          {file ? `${(file.size / 1024).toFixed(1)} KB` : 'or click to browse — CSV format only'}
        </p>
        <input id="csv-input" type="file" accept=".csv" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
      </div>

      <div className="glass-card p-5 mt-4">
        <h3 className="font-bold text-surface-900 dark:text-surface-100 mb-2 text-sm">Required CSV Headers:</h3>
        <code className="text-xs bg-surface-100 dark:bg-surface-800 g-surface-800 px-3 py-2 rounded-lg block text-brand-600 ">
          {requiredFields.join(', ')}
        </code>
        <p className="text-xs text-surface-500 mt-2">
          Example: 22CS001,Akhil Kumar,akhil@college.edu,Male,GVP College of Engineering,Hyderabad,CSE,A
          <br />Column mapping is configurable in <code className="text-surface-400">backend/app/utils/csv_mapping.py</code>
          <br />Default password: <code className="text-surface-400">Institution@123</code>. Students enroll their own face on first login.
        </p>
      </div>

      {file && (
        <button onClick={handleUpload} disabled={loading} className="btn-primary w-full mt-4 py-3">
          {loading ? <><span className="spinner" /> Processing...</> : '🚀 Upload & Import'}
        </button>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card p-4 text-center">
              <CheckCircleIcon className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              <p className="text-2xl font-extrabold text-emerald-600">{result.success_count}</p>
              <p className="text-xs text-surface-500">Imported</p>
            </div>
            <div className="glass-card p-4 text-center">
              <DocumentDuplicateIcon className="w-8 h-8 mx-auto text-amber-500 mb-2" />
              <p className="text-2xl font-extrabold text-amber-600">{result.duplicate_count}</p>
              <p className="text-xs text-surface-500">Duplicates</p>
            </div>
            <div className="glass-card p-4 text-center">
              <ExclamationTriangleIcon className="w-8 h-8 mx-auto text-red-500 mb-2" />
              <p className="text-2xl font-extrabold text-red-600">{result.failed_count}</p>
              <p className="text-xs text-surface-500">Failed</p>
            </div>
          </div>

          {result.errors?.length > 0 && (
            <div className="glass-card p-4">
              <h4 className="font-bold text-red-600 mb-2 text-sm">Errors:</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-500">Row {e.row}: {e.error}</p>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

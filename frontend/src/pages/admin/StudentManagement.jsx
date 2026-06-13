import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';

export default function StudentManagement() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState({ open: false, student: null });
  const [editData, setEditData] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await api.get('/students?per_page=100');
      setStudents(res.data.students);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (student) => {
    setEditData({
      name: student.name,
      email: student.email,
      roll_number: student.roll_number,
      department: student.department,
      section: student.section,
      year: student.year,
      phone: student.phone || '',
    });
    setEditModal({ open: true, student });
  };

  const handleSaveEdit = async () => {
    try {
      await api.put(`/students/${editModal.student.id}`, editData);
      setEditModal({ open: false, student: null });
      fetchStudents();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update student');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/students/${id}`);
      setDeleteConfirm(null);
      fetchStudents();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete student');
    }
  };

  const columns = [
    { key: 'roll_number', label: 'Roll No.' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'department', label: 'Department' },
    { key: 'section', label: 'Section' },
    { key: 'year', label: 'Year' },
    {
      key: 'has_face_data',
      label: 'Face Data',
      render: (val) => (
        <span className={`badge ${val ? 'badge--success' : 'badge--danger'}`}>
          {val ? '✅ Registered' : '❌ None'}
        </span>
      ),
    },
  ];

  if (loading) {
    return <div className="page-content"><div className="loading-spinner">Loading students...</div></div>;
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2 className="page-title">Student Management</h2>
        <button className="btn btn--primary" onClick={() => navigate('/admin/register')}>
          ➕ Add Student
        </button>
      </div>

      <DataTable
        columns={columns}
        data={students}
        actions={(row) => (
          <div className="table-actions">
            <button className="btn btn--sm btn--secondary" onClick={() => handleEdit(row)}>
              ✏️ Edit
            </button>
            <button className="btn btn--sm btn--danger" onClick={() => setDeleteConfirm(row)}>
              🗑️ Delete
            </button>
          </div>
        )}
      />

      {/* Edit Modal */}
      <Modal
        isOpen={editModal.open}
        onClose={() => setEditModal({ open: false, student: null })}
        title="Edit Student"
      >
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={editData.name || ''}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" value={editData.email || ''}
              onChange={(e) => setEditData({ ...editData, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Roll Number</label>
            <input className="form-input" value={editData.roll_number || ''}
              onChange={(e) => setEditData({ ...editData, roll_number: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Department</label>
            <input className="form-input" value={editData.department || ''}
              onChange={(e) => setEditData({ ...editData, department: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Section</label>
            <input className="form-input" value={editData.section || ''}
              onChange={(e) => setEditData({ ...editData, section: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Year</label>
            <input className="form-input" type="number" value={editData.year || ''}
              onChange={(e) => setEditData({ ...editData, year: e.target.value })} />
          </div>
        </div>
        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={() => setEditModal({ open: false, student: null })}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={handleSaveEdit}>Save Changes</button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Confirm Delete"
        size="small"
      >
        <p>Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?</p>
        <p className="text-muted">This will remove all face data and attendance records.</p>
        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
          <button className="btn btn--danger" onClick={() => handleDelete(deleteConfirm.id)}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}

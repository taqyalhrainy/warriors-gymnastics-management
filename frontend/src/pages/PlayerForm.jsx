import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { createPlayer, updatePlayer, getPlayer } from '../services/players.js';
import { fetchGroups } from '../services/groups.js';
import { fetchParents } from '../services/parents.js';
import { fetchPrograms } from '../services/programs.js';
import { fetchCoaches } from '../services/coaches.js';

const PlayerFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [player, setPlayer] = useState({ fullName: '', dateOfBirth: '', parentId: '', parentPhone: '', programId: '', groupId: '', coachId: '', level: '', status: 'active' });
  const [parents, setParents] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [groups, setGroups] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([fetchParents(), fetchPrograms(), fetchGroups(), fetchCoaches()])
      .then(([parentData, programData, groupData, coachData]) => {
        setParents(parentData);
        setPrograms(programData);
        setGroups(groupData);
        setCoaches(coachData);
      })
      .catch(console.error);

    if (id) {
      getPlayer(id).then((data) => setPlayer({
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth?.split('T')[0] || '',
        parentId: data.parentId?._id || '',
        parentPhone: data.parentPhone || '',
        programId: data.programId?._id || '',
        groupId: data.groupId?._id || '',
        coachId: data.coachId?._id || '',
        level: data.level || '',
        status: data.status || 'active'
      })).catch(console.error);
    }
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'parentId') {
      const selectedParent = parents.find((parent) => parent._id === value);
      setPlayer({ ...player, parentId: value, parentPhone: selectedParent?.phone || '' });
      return;
    }
    setPlayer({ ...player, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      if (id) {
        await updatePlayer(id, player);
      } else {
        await createPlayer(player);
      }
      navigate('/players');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to save player');
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{id ? 'Edit Player' : 'Add Player'}</h1></div>
        <div className="form-card">
          {message && <p className="alert-error">{message}</p>}
          <form onSubmit={handleSubmit}>
            <label>Name</label>
            <input name="fullName" value={player.fullName} onChange={handleChange} required />

            <label>Date of Birth</label>
            <input name="dateOfBirth" type="date" value={player.dateOfBirth} onChange={handleChange} required />

            <label>Parent</label>
            <select name="parentId" value={player.parentId} onChange={handleChange} required>
              <option value="">Select Parent</option>
              {parents.map((parent) => (
                <option key={parent._id} value={parent._id}>{`${parent.name} (${parent.email})`}</option>
              ))}
            </select>

            <label>Parent Phone</label>
            <input name="parentPhone" value={player.parentPhone} onChange={handleChange} required />

            <label>Program</label>
            <select name="programId" value={player.programId} onChange={handleChange}>
              <option value="">Select Program</option>
              {programs.map((program) => (
                <option key={program._id} value={program._id}>{program.name}</option>
              ))}
            </select>

            <label>Group</label>
            <select name="groupId" value={player.groupId} onChange={handleChange}>
              <option value="">Choose Group</option>
              {groups.map((group) => <option key={group._id} value={group._id}>{group.name}</option>)}
            </select>

            <label>Coach</label>
            <select name="coachId" value={player.coachId} onChange={handleChange}>
              <option value="">Select Coach</option>
              {coaches.map((coach) => <option key={coach._id} value={coach._id}>{coach.name}</option>)}
            </select>

            <label>Status</label>
            <select name="status" value={player.status} onChange={handleChange}>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="frozen">Frozen</option>
              <option value="left">Left</option>
            </select>

            <label>Level</label>
            <input name="level" value={player.level} onChange={handleChange} />

            <button type="submit" className="btn-primary">Save Player</button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default PlayerFormPage;

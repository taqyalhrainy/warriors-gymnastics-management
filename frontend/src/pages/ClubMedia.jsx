import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { createClubMedia, deleteClubMedia, fetchAdminClubMedia, updateClubMedia } from '../services/clubMedia.js';
import { compressProfileImage } from '../utils/imageUpload.js';

const emptyForm = {
  id: '',
  type: 'image',
  title: '',
  caption: '',
  mediaUrl: '',
  thumbnailUrl: '',
  displayOrder: 0,
  isActive: true,
  isFeatured: false
};

const ClubMediaPage = () => {
  const [media, setMedia] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadMedia = (force = false) => {
    setIsLoading(true);
    fetchAdminClubMedia({ force })
      .then(setMedia)
      .catch((error) => setMessage(error.response?.data?.message || 'Unable to load media.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));

  const handleImageFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const mediaUrl = await compressProfileImage(file, { maxSide: 1600, quality: 0.86 });
      updateForm({ type: 'image', mediaUrl });
    } catch (error) {
      setMessage(error.message || 'Unable to read image.');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      const payload = {
        type: form.type,
        title: form.title,
        caption: form.caption,
        mediaUrl: form.mediaUrl,
        thumbnailUrl: form.thumbnailUrl,
        displayOrder: Number(form.displayOrder || 0),
        isActive: form.isActive,
        isFeatured: form.isFeatured
      };
      if (form.id) {
        await updateClubMedia(form.id, payload);
        setMessage('Media updated.');
      } else {
        await createClubMedia(payload);
        setMessage('Media added.');
      }
      setForm(emptyForm);
      loadMedia(true);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save media.');
    }
  };

  const handleEdit = (item) => {
    setForm({
      id: item._id,
      type: item.type || 'image',
      title: item.title || '',
      caption: item.caption || '',
      mediaUrl: item.mediaUrl || '',
      thumbnailUrl: item.thumbnailUrl || '',
      displayOrder: item.displayOrder || 0,
      isActive: item.isActive !== false,
      isFeatured: Boolean(item.isFeatured)
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this media item?')) return;
    try {
      await deleteClubMedia(id);
      setMedia((current) => current.filter((item) => item._id !== id));
      setMessage('Media deleted.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to delete media.');
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Media Gallery</h1></div>
        <div className="grid-two">
          <section className="form-card">
            <h2>{form.id ? 'Edit media' : 'Add media'}</h2>
            {message && <p className="alert-info">{message}</p>}
            <form onSubmit={handleSubmit}>
              <label>Type</label>
              <select value={form.type} onChange={(event) => updateForm({ type: event.target.value, mediaUrl: '' })}>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
              <label>Title</label>
              <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} />
              <label>Caption</label>
              <textarea value={form.caption} onChange={(event) => updateForm({ caption: event.target.value })} />
              {form.type === 'image' && (
                <>
                  <label>Upload image</label>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageFile} />
                </>
              )}
              <label>{form.type === 'video' ? 'Video URL' : 'Image URL or uploaded image data'}</label>
              <input value={form.mediaUrl} onChange={(event) => updateForm({ mediaUrl: event.target.value })} required />
              <label>Thumbnail URL</label>
              <input value={form.thumbnailUrl} onChange={(event) => updateForm({ thumbnailUrl: event.target.value })} />
              <label>Display order</label>
              <input type="number" value={form.displayOrder} onChange={(event) => updateForm({ displayOrder: event.target.value })} />
              <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => updateForm({ isActive: event.target.checked })} /> Visible on public page</label>
              <label className="checkbox-row"><input type="checkbox" checked={form.isFeatured} onChange={(event) => updateForm({ isFeatured: event.target.checked })} /> Featured</label>
              <div className="saved-message-actions">
                <button className="btn-primary" type="submit">{form.id ? 'Save changes' : 'Add media'}</button>
                {form.id && <button className="btn-secondary" type="button" onClick={() => setForm(emptyForm)}>Cancel</button>}
              </div>
            </form>
          </section>
          <section className="table-card media-manager-card">
            <div className="table-toolbar"><h2>Published media</h2></div>
            {isLoading ? <p>Loading media...</p> : (
              <div className="media-manager-list">
                {media.length ? media.map((item) => (
                  <article className="media-manager-item" key={item._id}>
                    <div className="media-manager-preview">
                      {item.type === 'video'
                        ? <video src={item.mediaUrl} poster={item.thumbnailUrl || undefined} preload="metadata" controls />
                        : <img src={item.mediaUrl} alt={item.title || 'Club media'} loading="lazy" />}
                    </div>
                    <div>
                      <strong>{item.title || 'Untitled media'}</strong>
                      <p>{item.caption || 'No caption'}</p>
                      <span>{item.type} / order {item.displayOrder} / {item.isActive ? 'visible' : 'hidden'}{item.isFeatured ? ' / featured' : ''}</span>
                    </div>
                    <div className="saved-message-actions">
                      <button className="btn-secondary" type="button" onClick={() => handleEdit(item)}>Edit</button>
                      <button className="btn-danger" type="button" onClick={() => handleDelete(item._id)}>Delete</button>
                    </div>
                  </article>
                )) : <p className="empty-state">No media yet.</p>}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default ClubMediaPage;

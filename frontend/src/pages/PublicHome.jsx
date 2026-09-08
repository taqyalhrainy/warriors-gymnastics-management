import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InstallAppButton from '../components/InstallAppButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchPublicClubMedia } from '../services/clubMedia.js';
import warriorsLogo from '../assets/warriors-logo.png';

const PublicHomePage = () => {
  const { user } = useAuth();
  const [media, setMedia] = useState([]);
  const [activeMedia, setActiveMedia] = useState(null);

  useEffect(() => {
    fetchPublicClubMedia().then(setMedia).catch(console.error);
  }, []);

  const featured = media.find((item) => item.isFeatured) || media[0];
  const dashboardPath = user?.role === 'parent' ? '/parent' : '/admin';

  return (
    <main className="public-site">
      <header className="public-nav">
        <Link className="public-brand" to="/">
          <img src={warriorsLogo} alt="Warriors Gymnastics Academy" />
          <span>Warriors Gymnastics</span>
        </Link>
        <nav>
          {user ? <Link className="public-login-link" to={dashboardPath}>Dashboard</Link> : <Link className="public-login-link" to="/login">Login</Link>}
          <InstallAppButton />
        </nav>
      </header>

      <section className="public-hero">
        <div className="public-hero-media">
          {featured?.type === 'video' ? (
            <video src={featured.mediaUrl} poster={featured.thumbnailUrl || undefined} preload="metadata" controls />
          ) : (
            <img src={featured?.mediaUrl || warriorsLogo} alt={featured?.title || 'Warriors Gymnastics Academy'} />
          )}
        </div>
        <div className="public-hero-copy">
          <span className="landing-kicker">Warriors Gymnastics Academy</span>
          <h1>Train with confidence. Grow with discipline.</h1>
          <p>Professional gymnastics training, organized attendance, parent updates, and club media in one polished app.</p>
          <div className="public-hero-actions">
            {user ? <Link className="btn-primary" to={dashboardPath}>Open Dashboard</Link> : <Link className="btn-primary" to="/login">Login</Link>}
            <InstallAppButton className="is-secondary" />
          </div>
        </div>
      </section>

      <section className="public-gallery-section">
        <div className="public-section-head">
          <span className="landing-kicker">Club Media</span>
          <h2>Gallery</h2>
        </div>
        {media.length ? (
          <div className="public-gallery-grid">
            {media.map((item) => (
              <button type="button" className="public-media-card" key={item._id} onClick={() => setActiveMedia(item)}>
                {item.type === 'video' ? (
                  <video src={item.mediaUrl} poster={item.thumbnailUrl || undefined} preload="metadata" muted playsInline />
                ) : (
                  <img src={item.mediaUrl} alt={item.title || 'Club media'} loading="lazy" />
                )}
                <span>{item.type === 'video' ? 'Video' : 'Photo'}</span>
                <strong>{item.title || 'Warriors highlight'}</strong>
              </button>
            ))}
          </div>
        ) : (
          <div className="public-empty-gallery">
            <img src={warriorsLogo} alt="" />
            <p>Club media will appear here when the admin publishes it.</p>
          </div>
        )}
      </section>

      <footer className="public-footer">
        <strong>Warriors Gymnastics Academy</strong>
        <span>Install the app for faster access from your phone home screen.</span>
      </footer>

      {activeMedia && (
        <div className="public-media-viewer" role="presentation" onClick={() => setActiveMedia(null)}>
          <section role="dialog" aria-modal="true" aria-label={activeMedia.title || 'Club media'} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setActiveMedia(null)} aria-label="Close">x</button>
            {activeMedia.type === 'video' ? (
              <video src={activeMedia.mediaUrl} poster={activeMedia.thumbnailUrl || undefined} controls preload="metadata" />
            ) : (
              <img src={activeMedia.mediaUrl} alt={activeMedia.title || 'Club media'} />
            )}
            {(activeMedia.title || activeMedia.caption) && (
              <div>
                <h3>{activeMedia.title}</h3>
                <p>{activeMedia.caption}</p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
};

export default PublicHomePage;

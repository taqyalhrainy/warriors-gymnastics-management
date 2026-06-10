const StatsCard = ({ title, value, description }) => {
  return (
    <div className="stat-card">
      <h3>{title}</h3>
      <p className="stat-value">{value}</p>
      <span>{description}</span>
    </div>
  );
};

export default StatsCard;

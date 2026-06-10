const DataTable = ({ columns, rows }) => {
  return (
    <table className="data-table">
      <thead>
        <tr>{columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={columns.length} className="empty-state">No records found.</td></tr>
        ) : rows.map((row, index) => (
          <tr key={index}>
            {columns.map((col) => <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default DataTable;

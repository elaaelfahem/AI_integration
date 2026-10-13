export function TableSkeletonRows({
  columns,
  rows = 5,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }, (_, colIndex) => (
            <td key={colIndex}>
              <span
                className="skeleton-box"
                style={{
                  display: 'inline-block',
                  width:
                    colIndex === 0 ? '70%' : rowIndex % 2 === 0 ? '85%' : '60%',
                  height: 14,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

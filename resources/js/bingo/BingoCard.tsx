import styles from './Bingo.module.css'

const BingoCard = ({
  data,
  headers,
  showRowNumbers,
}: {
  data: string[][]
  headers?: string[]
  showRowNumbers?: boolean
}) => {
  return (
    <table style={{ margin: '0 auto' }}>
      {headers && (
        <thead>
          <tr>
            <th>#</th>
            {headers.map((_, index) => (
              <th key={index}>Column {index + 1}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {data.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {showRowNumbers && <td>{rowIndex + 1}</td>}
            {row.map((cell, cellIndex) => (
              <td className={styles.tableCell} key={cellIndex}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default BingoCard

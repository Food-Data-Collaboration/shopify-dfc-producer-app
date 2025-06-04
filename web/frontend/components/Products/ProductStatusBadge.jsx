export default function ProductStatusBadge({ isEnabled, isLoading, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: isLoading ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        borderRadius: '16px',
        backgroundColor: isEnabled ? '#ebf9eb' : '#f1f2f3',
        color: isEnabled ? '#108043' : '#637381',
        fontWeight: '500',
        fontSize: '14px',
        lineHeight: '16px',
        userSelect: 'none',
        border: 'none',
        transition: 'all 0.2s ease',
        opacity: isLoading ? 0.7 : 1
      }}
    >
      {isLoading ? (
        <>
          <div
            className="spinner"
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid #919eab',
              borderRadius: '50%',
              borderTopColor: 'transparent',
              animation: 'spin 1s linear infinite',
              display: 'inline-block'
            }}
          />
          <style>
            {`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}
          </style>
          {isEnabled ? 'Enabled' : 'Disabled'}
        </>
      ) : (
        <>
          <span
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: isEnabled ? '#108043' : '#919eab',
              display: 'inline-block',
              position: 'relative'
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '3px',
                left: '3px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: isEnabled ? '#ebf9eb' : '#f1f2f3'
              }}
            />
          </span>
          {isEnabled ? 'Enabled' : 'Disabled'}
        </>
      )}
    </div>
  );
}

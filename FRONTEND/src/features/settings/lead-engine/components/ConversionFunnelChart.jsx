import PropTypes from "prop-types";

const ConversionFunnelChart = ({ data }) => (
  <div className="small border rounded p-3 bg-light">
    {(data || []).map((row) => (
      <div key={row.stage} className="d-flex justify-content-between">
        <span>{row.stage}</span>
        <span>{row.count}</span>
      </div>
    ))}
  </div>
);

ConversionFunnelChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object),
};

export default ConversionFunnelChart;

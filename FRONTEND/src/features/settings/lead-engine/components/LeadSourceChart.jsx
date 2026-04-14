import PropTypes from "prop-types";

const LeadSourceChart = ({ data }) => (
  <div className="small border rounded p-3 bg-light">
    <div><strong>Leads automáticos:</strong> {data?.auto_leads ?? 0}</div>
    <div><strong>Leads manuales:</strong> {data?.manual_leads ?? 0}</div>
  </div>
);

LeadSourceChart.propTypes = {
  data: PropTypes.object,
};

export default LeadSourceChart;

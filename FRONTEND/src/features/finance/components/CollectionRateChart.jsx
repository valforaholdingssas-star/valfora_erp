import PropTypes from "prop-types";
import Chart from "react-apexcharts";

const CollectionRateChart = ({ invoiced, collected }) => (
  <Chart
    type="line"
    height={290}
    series={[
      { name: "Facturado", data: [invoiced || 0] },
      { name: "Cobrado", data: [collected || 0] },
    ]}
    options={{
      chart: { toolbar: { show: false } },
      xaxis: { categories: ["Periodo"] },
      stroke: { curve: "smooth" },
      colors: ["#6f42c1", "#198754"],
    }}
  />
);

CollectionRateChart.propTypes = {
  invoiced: PropTypes.number,
  collected: PropTypes.number,
};

export default CollectionRateChart;

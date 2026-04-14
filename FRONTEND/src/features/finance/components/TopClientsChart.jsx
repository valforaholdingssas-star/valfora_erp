import PropTypes from "prop-types";
import Chart from "react-apexcharts";

const TopClientsChart = ({ rows }) => {
  const labels = (rows || []).map((r) => r.name || "Cliente");
  const values = (rows || []).map((r) => r.total || 0);
  return (
    <Chart
      type="bar"
      height={290}
      series={[{ name: "Facturado", data: values }]}
      options={{
        chart: { toolbar: { show: false } },
        plotOptions: { bar: { horizontal: true } },
        xaxis: { categories: labels },
        colors: ["#0d6efd"],
      }}
    />
  );
};

TopClientsChart.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object),
};

export default TopClientsChart;

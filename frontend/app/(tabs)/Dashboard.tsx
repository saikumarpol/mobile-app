// app/dashboard.tsx

import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Dimensions,
} from "react-native";
import axios from "axios";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { PieChart } from "react-native-chart-kit";

const BASE_URL = "https://pl-api.iiit.ac.in/rcts/anemiav2/";
const screenWidth = Dimensions.get("window").width;

export default function Dashboard() {
  const router = useRouter();

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${BASE_URL}/api/children`);
      setData(res.data || []);
    } catch (err) {
      console.log("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData().finally(() => setRefreshing(false));
  }, [fetchData]);

  // Stats
  const totalRecords = data.length;

  const avgAge =
    totalRecords > 0
      ? (
          data.reduce((sum, item) => sum + (Number(item.age) || 0), 0) /
          totalRecords
        ).toFixed(1)
      : "—";

  const avgBMI =
    totalRecords > 0
      ? (
          data.reduce((sum, item) => sum + (Number(item.bmi) || 0), 0) /
          totalRecords
        ).toFixed(1)
      : "—";

  const anemiaCount = data.filter((item) =>
    ["Anemic", "Grossly Anemic"].includes(item.anemiaStatus)
  ).length;

  const anemiaPercent =
    totalRecords > 0
      ? Math.round((anemiaCount / totalRecords) * 100)
      : 0;

  // BMI counts
  const bmiCounts = {
    underweight: data.filter(
      (i) => i.bmiCategory?.trim().toLowerCase() === "underweight"
    ).length,
    normal: data.filter(
      (i) => i.bmiCategory?.trim().toLowerCase() === "normal weight"
    ).length,
    overweight: data.filter(
      (i) => i.bmiCategory?.trim().toLowerCase() === "overweight"
    ).length,
    obesity: data.filter(
      (i) => i.bmiCategory?.trim().toLowerCase() === "obesity"
    ).length,
  };

  const bmiPieData = [
    { name: "Underweight", population: bmiCounts.underweight, color: "#F9E79F" },
    { name: "Normal weight", population: bmiCounts.normal, color: "#8FD9A8" },
    { name: "Overweight", population: bmiCounts.overweight, color: "#F8C471" },
    { name: "Obesity", population: bmiCounts.obesity, color: "#F1948A" },
  ].filter((item) => item.population > 0);

  const anemiaPieData = [
    { name: "Normal", population: totalRecords - anemiaCount, color: "#8FD9A8" },
    { name: "Anemic", population: data.filter(i => i.anemiaStatus === "Anemic").length, color: "#F8C471" },
    { name: "Grossly Anemic", population: data.filter(i => i.anemiaStatus === "Grossly Anemic").length, color: "#EC7063" },
  ].filter((item) => item.population > 0);

  const chartConfig = {
    backgroundGradientFrom: "#fff",
    backgroundGradientTo: "#fff",
    color: () => "#495057",
    labelColor: () => "#495057",
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });

  const recentRecords = [...data]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#4c6ef5" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Child Health Dashboard</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Icon name="refresh" size={26} color="#4c6ef5" />
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Icon name="account-group" size={28} color="#4c6ef5" />
            <Text style={styles.statValue}>{totalRecords}</Text>
            <Text style={styles.statLabel}>Total Children</Text>
          </View>

          <View style={styles.statCard}>
            <Icon name="cake" size={28} color="#F8C471" />
            <Text style={styles.statValue}>{avgAge}</Text>
            <Text style={styles.statLabel}>Avg Age</Text>
          </View>

          <View style={styles.statCard}>
            <Icon name="scale-bathroom" size={28} color="#8FD9A8" />
            <Text style={styles.statValue}>{avgBMI}</Text>
            <Text style={styles.statLabel}>Avg BMI</Text>
          </View>

          <View style={styles.statCard}>
            <Icon
              name="blood-bag"
              size={28}
              color={anemiaPercent > 30 ? "#EC7063" : "#8FD9A8"}
            />
            <Text style={styles.statValue}>{anemiaPercent}%</Text>
            <Text style={styles.statLabel}>Anemic</Text>
          </View>
        </View>

        {/* BMI Chart */}
        {bmiPieData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>
              BMI Category Distribution
            </Text>

         <View style={styles.chartWrapper}>
  <PieChart
    data={bmiPieData}
    width={screenWidth - 78}
    height={270}
    chartConfig={chartConfig}
    accessor="population"
    backgroundColor="transparent"
    paddingLeft="70"
    absolute
    hasLegend={false}
  />
</View>

            <View style={styles.legendContainer}>
              {bmiPieData.map((item, index) => (
                <View key={index} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendColor,
                      { backgroundColor: item.color },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    {item.name}: {item.population}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Anemia Chart */}
        {anemiaPieData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>
              Anemia Status Distribution
            </Text>

            <View style={styles.chartWrapper}>
  <PieChart
    data={anemiaPieData}
    width={screenWidth - 78}
    height={270}
    chartConfig={chartConfig}
    accessor="population"
    backgroundColor="transparent"
    paddingLeft="70"
    absolute
    hasLegend={false}
  />
</View>


            <View style={styles.legendContainer}>
              {anemiaPieData.map((item, index) => (
                <View key={index} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendColor,
                      { backgroundColor: item.color },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    {item.name}: {item.population}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent Records (WITH BMI + ANEMIA BADGES RESTORED) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Records</Text>
            <TouchableOpacity onPress={() => router.push("/view")}>
              <Text style={styles.viewAll}>View All →</Text>
            </TouchableOpacity>
          </View>

          {recentRecords.map((item) => (
            <TouchableOpacity
              key={item._id}
              style={styles.miniCard}
              onPress={() => router.push("/view")}
            >
              <View style={styles.miniHeader}>
                <Text style={styles.miniName}>
                  {item.childName || "Child"}
                </Text>
                <Text style={styles.miniDate}>
                  {formatDate(item.createdAt)}
                </Text>
              </View>

              <View style={styles.miniBadges}>
                <View
                  style={[
                    styles.miniBadge,
                    { backgroundColor: getCategoryColor(item.bmiCategory) },
                  ]}
                >
                  <Text style={styles.miniBadgeText}>
                    {item.bmiCategory || "—"}
                  </Text>
                </View>

                <View
                  style={[
                    styles.miniBadge,
                    { backgroundColor: getCategoryColor(item.anemiaStatus) },
                  ]}
                >
                  <Text style={styles.miniBadgeText}>
                    {item.anemiaStatus || "—"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push("/")}
        >
          <Icon name="plus-circle" size={24} color="#fff" />
          <Text style={styles.actionText}>Add New Record</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// keep your original badge color logic
const getCategoryColor = (category?: string) => {
  if (!category) return "#adb5bd";
  const cat = category.toLowerCase().trim();
  if (cat === "normal weight" || cat === "normal") return "#8FD9A8";
  if (cat === "underweight") return "#F9E79F";
  if (cat === "overweight") return "#F8C471";
  if (cat === "obesity") return "#F1948A";
  if (cat === "anemic") return "#F8C471";
  if (cat === "grossly anemic") return "#EC7063";
  return "#495057";
};
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f8f9fa" },

  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  screenTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#212529",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  statCard: {
    width: (screenWidth - 48) / 2,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },

  statValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#212529",
    marginVertical: 4,
  },

  statLabel: {
    fontSize: 13,
    color: "#6c757d",
  },

  chartCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },

  chartWrapper: {
    width: "100%",
    alignItems: "center",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#212529",
    marginBottom: 16,
    textAlign: "center",
  },

  legendContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 16,
    gap: 16,
    paddingHorizontal: 10,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },

  legendText: {
    fontSize: 14,
    color: "#495057",
    fontWeight: "500",
  },

  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  viewAll: {
    fontSize: 14,
    color: "#4c6ef5",
    fontWeight: "600",
  },

  miniCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },

  miniHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  miniName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#212529",
  },

  miniDate: {
    fontSize: 13,
    color: "#868e96",
  },

  miniBadges: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },

  miniBadge: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    minWidth: 110,
    alignItems: "center",
  },

  miniBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4c6ef5",
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
    gap: 10,
  },

  actionText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  emptyText: {
    textAlign: "center",
    color: "#868e96",
    fontSize: 16,
    paddingVertical: 30,
  },

  emptyChart: {
    padding: 40,
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },

  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6c757d",
  },
});

// app/(tabs)/view.tsx
import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import axios from "axios";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

const BASE_URL = "https://pl-api.iiit.ac.in/rcts/anemiav2/";

export default function ViewScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${BASE_URL}/api/children`);
      setData(res.data);
      setFilteredData(res.data);
    } catch (err) {
      console.log("Error fetching records", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!searchQuery.trim()) { setFilteredData(data); return; }
    const q = searchQuery.toLowerCase();
    setFilteredData(data.filter(
      (item) =>
        item.childName?.toLowerCase().includes(q) ||
        item.parentName?.toLowerCase().includes(q)
    ));
  }, [searchQuery, data]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData().finally(() => setRefreshing(false));
  }, [fetchData]);

  const getBMIColor = (category?: string) => {
    if (!category) return "#adb5bd";
    const cat = category.toLowerCase().trim();
    if (cat === "underweight")                        return "#F9E79F";
    if (cat === "normal weight" || cat === "normal")  return "#8FD9A8";
    if (cat === "overweight")                         return "#F8C471";
    if (cat === "obesity")                            return "#F1948A";
    return "#495057";
  };

  const getAnemiaColor = (status?: string) => {
    if (!status) return "#adb5bd";
    const st = status.toLowerCase().trim();
    if (st === "grossly anemic") return "#EC7063";
    if (st === "anemic")         return "#F8C471";
    if (st === "normal")         return "#8FD9A8";
    return "#495057";
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });

  // ✅ FIX: keyExtractor falls back to index if _id is missing
  const keyExtractor = (item: any, index: number) =>
    item._id ? String(item._id) : String(index);

  const renderItem = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      key={item._id ? String(item._id) : String(index)}
      style={styles.card}
      activeOpacity={0.88}
    >
      <View style={styles.cardHeader}>
        <View style={styles.nameContainer}>
          <Icon name="account-child" size={22} color="#4c6ef5" />
          <Text style={styles.childName}>{item.childName || "Unnamed"}</Text>
        </View>
        <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <Icon name="human-male-female" size={16} color="#868e96" />
          <Text style={styles.label}>Age</Text>
          <Text style={styles.value}>{item.age || "?"} yrs</Text>
        </View>
        <View style={styles.infoItem}>
          <Icon name="gender-male-female" size={16} color="#868e96" />
          <Text style={styles.label}>Gender</Text>
          <Text style={styles.value}>{item.gender || "—"}</Text>
        </View>
        <View style={styles.infoItem}>
          <Icon name="scale" size={16} color="#868e96" />
          <Text style={styles.label}>Weight</Text>
          <Text style={styles.value}>{item.weight || "?"} kg</Text>
        </View>
        <View style={styles.infoItem}>
          <Icon name="ruler" size={16} color="#868e96" />
          <Text style={styles.label}>Height</Text>
          <Text style={styles.value}>{item.height || "?"} cm</Text>
        </View>
      </View>

      <View style={styles.bmiRow}>
        <View style={styles.bmiBlock}>
          <Text style={styles.label}>BMI</Text>
          <Text style={styles.bmiValue}>
            {item.bmi ? Number(item.bmi).toFixed(1) : "—"}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: getBMIColor(item.bmiCategory) }]}>
          <Text style={styles.badgeText}>{item.bmiCategory || "Unknown"}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: getAnemiaColor(item.anemiaStatus) }]}>
          <Text style={styles.badgeText}>{item.anemiaStatus || "Unknown"}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Icon name="account" size={16} color="#868e96" />
        <Text style={styles.parentText}>Parent: {item.parentName || "—"}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#4c6ef5" />
        <Text style={styles.loadingText}>Loading records...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {/* ✅ FIX: Header moved OUT of ListHeaderComponent to avoid nested ScrollView warning */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Children Records</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Icon name="refresh" size={24} color="#4c6ef5" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Icon name="magnify" size={20} color="#868e96" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by child or parent name..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          placeholderTextColor="#adb5bd"
        />
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="database-search" size={60} color="#ced4da" />
            <Text style={styles.emptyText}>
              {searchQuery ? "No matching records found" : "No records found"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#f8f9fa" },
  center:      { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8f9fa" },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  screenTitle: { fontSize: 22, fontWeight: "700", color: "#212529" },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    height: 48,
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: "#212529" },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  nameContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  childName:     { fontSize: 19, fontWeight: "700", color: "#212529" },
  date:          { fontSize: 13, color: "#868e96", fontWeight: "500" },
  divider:       { height: 1, backgroundColor: "#e9ecef", marginBottom: 14 },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  infoItem: {
    width: "48%",
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: { fontSize: 13, color: "#6c757d", marginBottom: 2 },
  value: { fontSize: 15, fontWeight: "600", color: "#212529" },

  bmiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  bmiBlock: {
    backgroundColor: "#f1f3f5",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    minWidth: 70,
  },
  bmiValue:  { fontSize: 18, fontWeight: "bold", color: "#343a40" },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    minWidth: 90,
    alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  footer:     { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  parentText: { fontSize: 14, color: "#495057" },

  emptyContainer: { alignItems: "center", paddingTop: 60 },
  loadingText:    { marginTop: 16, fontSize: 16, color: "#6c757d" },
  emptyText:      { marginTop: 16, fontSize: 17, color: "#868e96", textAlign: "center" },
});
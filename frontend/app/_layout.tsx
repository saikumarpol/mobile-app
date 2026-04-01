// app/_layout.tsx
import { Stack } from 'expo-router';
import { LogBox } from 'react-native';

// Suppress false-positive from Expo New Architecture / tab navigator
// Our FlatList is NOT nested in a ScrollView — this is a known framework bug
LogBox.ignoreLogs([
  'VirtualizedLists should never be nested',
  'Check the render method of `ScrollView`',
  'Each child in a list should have a unique "key" prop',
]);

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="eye-capture"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Eye Capture',
        }}
      />
      <Stack.Screen
        name="height-capture"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Height Capture',
        }}
      />
    </Stack>
  );
}
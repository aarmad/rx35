import React from "react";
import { View, ActivityIndicator } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/ThemeContext";
import { typography } from "@/theme/tokens";
import { useAuth } from "@/auth/AuthContext";

import HomeScreen from "@/screens/HomeScreen";
import MapScreen from "@/screens/MapScreen";
import HistoryScreen from "@/screens/HistoryScreen";
import AlertsScreen from "@/screens/AlertsScreen";
import AssistantScreen from "@/screens/AssistantScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import LoginScreen from "@/screens/LoginScreen";
import RegisterScreen from "@/screens/RegisterScreen";

// Barre du bas volontairement réduite à 4 onglets (retour utilisateur) :
// Alertes et Réglages/Compte restent accessibles partout via la TopBar,
// mais poussés en tant qu'écrans de pile plutôt que noyés dans les onglets.
export type RootTabParamList = {
  Accueil: undefined;
  Carte: undefined;
  Historique: undefined;
  Assistant: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  Alertes: undefined;
  Reglages: undefined;
  Login: undefined;
  Register: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Accueil: "home-outline",
  Carte: "map-outline",
  Historique: "stats-chart-outline",
  Assistant: "chatbubble-ellipses-outline",
};

function MainTabs() {
  const { colors } = useAppTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: typography.bodyMedium, fontSize: 10 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name as keyof RootTabParamList]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Accueil" component={HomeScreen} />
      <Tab.Screen name="Carte" component={MapScreen} />
      <Tab.Screen name="Historique" component={HistoryScreen} />
      <Tab.Screen name="Assistant" component={AssistantScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { colors, isDark } = useAppTheme();
  const { isAuthenticated, isLoading } = useAuth();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, presentation: "modal" }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ presentation: "card" }} />
            <Stack.Screen
              name="Alertes"
              component={AlertsScreen}
              options={{
                headerShown: true,
                headerTitle: "Alertes",
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
                headerTitleStyle: { fontFamily: typography.bodySemiBold },
              }}
            />
            <Stack.Screen
              name="Reglages"
              component={SettingsScreen}
              options={{
                headerShown: true,
                headerTitle: "Réglages et compte",
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
                headerTitleStyle: { fontFamily: typography.bodySemiBold },
              }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ presentation: "card" }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ presentation: "card" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

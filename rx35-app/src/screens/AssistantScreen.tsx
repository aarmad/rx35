import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "@jamsch/expo-speech-recognition";
import { TopBar } from "@/components/TopBar";
import { useAppTheme } from "@/theme/ThemeContext";
import { useParcel } from "@/parcels/ParcelContext";
import { typography, spacing, radius } from "@/theme/tokens";
import { getChatHistory, sendChatMessage, sendChatPhoto } from "@/services/api";
import { ChatMessage } from "@/services/types";

const SUGGESTIONS = ["Faut-il irriguer maintenant ?", "Quel est le niveau du réservoir ?", "Pourquoi l'alarme s'est déclenchée hier ?"];

// Message local (non enregistré côté serveur) servant à afficher une erreur
// dans le fil de discussion, à la place d'une réponse de l'assistant.
function systemMessage(text: string): ChatMessage {
  return { id: `err_${Date.now()}`, role: "assistant", text, timestamp: Date.now() / 1000 };
}

export default function AssistantScreen() {
  const { colors } = useAppTheme();
  const { current: parcel } = useParcel();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Lecture à voix haute des réponses (cahier §11 : « réponses lues à voix
  // haute », utile en extérieur ou pour un utilisateur peu à l'aise avec
  // l'écrit). La synthèse est faite par le téléphone, sans connexion ni
  // service externe.
  const toggleSpeech = async (id: string, text: string) => {
    if (speakingId === id) {
      await Speech.stop();
      setSpeakingId(null);
      return;
    }
    await Speech.stop();
    setSpeakingId(id);
    Speech.speak(text, {
      language: "fr-FR",
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  };

  // Ne pas laisser la voix continuer quand on quitte l'écran.
  useEffect(() => () => {
    Speech.stop();
    ExpoSpeechRecognitionModule.abort();
  }, []);

  // --- Dictée vocale (cahier §11) ---
  // La reconnaissance est faite par le moteur Android du téléphone : pas de
  // service tiers, pas de coût par minute, et le français reste disponible
  // hors connexion si le pack de langue est installé sur l'appareil.
  // Le texte reconnu remplit le champ de saisie ; l'agriculteur relit avant
  // d'envoyer plutôt que de voir partir une transcription approximative.
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript;
    if (transcript) setInput(transcript);
  });
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    // "no-speech" = l'utilisateur n'a rien dit : inutile de l'alerter.
    if (event.error === "no-speech") return;
    Alert.alert(
      "Dictée indisponible",
      "La reconnaissance vocale n'a pas pu démarrer. Vérifiez que la saisie vocale Google est installée et que le français est téléchargé dans les réglages du téléphone."
    );
  });

  const toggleDictation = async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission refusée", "Autorisez l'accès au micro pour dicter votre question.");
      return;
    }
    await Speech.stop(); // ne pas s'écouter soi-même pendant la dictée
    setSpeakingId(null);
    setListening(true);
    ExpoSpeechRecognitionModule.start({
      lang: "fr-FR",
      interimResults: true,
      continuous: false,
    });
  };

  useEffect(() => {
    getChatHistory(parcel!.id)
      .then(setMessages)
      .catch((err) => setMessages([systemMessage(err?.message ?? "Historique indisponible.")]));
  }, []);

  // L'assistant dépend du service Claude côté backend : il peut répondre en
  // erreur (clé ANTHROPIC_API_KEY absente, quota, réseau). On affiche
  // l'explication dans le fil plutôt que de laisser la saisie bloquée sur
  // "envoi en cours".
  const send = async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: `tmp_${Date.now()}`, role: "user", text: t, timestamp: Date.now() / 1000 }]);
    try {
      await sendChatMessage(parcel!.id, t);
      setMessages(await getChatHistory(parcel!.id));
    } catch (err: any) {
      setMessages((prev) => [...prev, systemMessage(err?.message ?? "Assistant indisponible.")]);
    } finally {
      setSending(false);
    }
  };

  const sendPhoto = async (uri: string) => {
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `tmp_${Date.now()}`, role: "user", text: "Photo envoyée pour diagnostic", imageUri: uri, timestamp: Date.now() / 1000 },
    ]);
    try {
      await sendChatPhoto(parcel!.id, uri);
      setMessages(await getChatHistory(parcel!.id));
    } catch (err: any) {
      setMessages((prev) => [...prev, systemMessage(err?.message ?? "Diagnostic photo indisponible.")]);
    } finally {
      setSending(false);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission refusée", "Autorisez l'accès à l'appareil photo pour diagnostiquer une plante.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.[0]?.uri) sendPhoto(result.assets[0].uri);
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission refusée", "Autorisez l'accès aux photos pour diagnostiquer une plante.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled && result.assets?.[0]?.uri) sendPhoto(result.assets[0].uri);
  };

  const openAttachmentMenu = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Annuler", "Prendre une photo", "Choisir depuis la galerie"], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) pickFromCamera();
          if (index === 2) pickFromLibrary();
        }
      );
    } else {
      Alert.alert("Diagnostiquer une plante", "Choisissez une source", [
        { text: "Annuler", style: "cancel" },
        { text: "Prendre une photo", onPress: pickFromCamera },
        { text: "Galerie", onPress: pickFromLibrary },
      ]);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <TopBar />
      <View style={styles.header}>
        <Text style={{ color: colors.accent, fontFamily: typography.bodySemiBold, fontSize: 12, textTransform: "uppercase" }}>
          Assistant RX35
        </Text>
        <Text style={{ color: colors.text, fontFamily: typography.display, fontSize: 24 }}>Parlons de votre parcelle</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.sm }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === "user"
                ? { backgroundColor: colors.primary, alignSelf: "flex-end", borderBottomRightRadius: 4 }
                : { backgroundColor: colors.surface, alignSelf: "flex-start", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
            ]}
          >
            {item.imageUri ? <Image source={{ uri: item.imageUri }} style={styles.chatImage} /> : null}
            <Text
              style={{
                color: item.role === "user" ? "#fff" : colors.text,
                fontFamily: typography.body,
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {item.text}
            </Text>
            {item.role === "assistant" && item.text.trim() ? (
              <Pressable
                onPress={() => toggleSpeech(item.id, item.text)}
                style={styles.speakButton}
                accessibilityLabel={speakingId === item.id ? "Arrêter la lecture" : "Écouter la réponse"}
                hitSlop={8}
              >
                <Ionicons
                  name={speakingId === item.id ? "stop-circle-outline" : "volume-medium-outline"}
                  size={16}
                  color={speakingId === item.id ? colors.accent : colors.textMuted}
                />
                <Text
                  style={{
                    color: speakingId === item.id ? colors.accent : colors.textMuted,
                    fontFamily: typography.bodyMedium,
                    fontSize: 12,
                    marginLeft: 5,
                  }}
                >
                  {speakingId === item.id ? "Arrêter" : "Écouter"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />

      {messages.length <= 1 ? (
        <View style={styles.suggestionsRow}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => send(s)}
              style={[styles.suggestionChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={{ color: colors.text, fontFamily: typography.body, fontSize: 12 }}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable
            onPress={openAttachmentMenu}
            style={[styles.iconRoundButton, { backgroundColor: colors.surfaceAlt }]}
            accessibilityLabel="Diagnostiquer une plante par photo"
          >
            <Ionicons name="camera-outline" size={19} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={toggleDictation}
            style={[
              styles.iconRoundButton,
              { backgroundColor: listening ? colors.accentSoft : colors.surfaceAlt, marginLeft: 6 },
            ]}
            accessibilityLabel={listening ? "Arrêter la dictée" : "Dicter un message"}
          >
            <Ionicons
              name={listening ? "stop-outline" : "mic-outline"}
              size={19}
              color={listening ? colors.accent : colors.textMuted}
            />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Écrivez votre question..."
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            style={[styles.sendButton, { backgroundColor: colors.primary, opacity: sending || !input.trim() ? 0.5 : 1 }]}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
        Appareil photo = diagnostic de plante par l'IA. Ce diagnostic est une aide : un agronome RX Stack
        confirme si le problème persiste.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  speakButton: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  bubble: { maxWidth: "82%", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  chatImage: { width: 200, height: 200, borderRadius: radius.sm, marginBottom: spacing.sm },
  suggestionsRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  iconRoundButton: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, marginLeft: 6 },
  sendButton: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginLeft: spacing.sm },
  disclaimer: { fontSize: 10, textAlign: "center", paddingBottom: spacing.sm },
});

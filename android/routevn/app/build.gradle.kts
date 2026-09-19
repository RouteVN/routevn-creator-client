plugins {
    id("com.android.application")
}

val releaseKeystorePath = providers.environmentVariable("ANDROID_KEYSTORE_PATH").orNull
val releaseKeystorePassword =
    providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword =
    providers.environmentVariable("ANDROID_KEY_PASSWORD").orNull
        ?: releaseKeystorePassword
val hasReleaseSigningConfig =
    !releaseKeystorePath.isNullOrBlank() &&
        !releaseKeystorePassword.isNullOrBlank() &&
        !releaseKeyAlias.isNullOrBlank()
val repoRoot = rootProject.projectDir.resolve("../..").canonicalFile
val androidNdkVersion = "29.0.14206865"
val routevnDistribution = providers.gradleProperty("routevnDistribution").orElse("direct").get()
require(routevnDistribution in setOf("direct", "google-play")) {
    "routevnDistribution must be direct or google-play"
}

val routevnUpdateApiUrl = providers.gradleProperty("routevnUpdateApiUrl")
    .orElse("http://127.0.0.1:8787/system/rpc").get()
fun javaString(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val buildAndroidRust by tasks.registering(Exec::class) {
    workingDir = repoRoot
    environment("ANDROID_NDK_VERSION", androidNdkVersion)
    commandLine("bash", "scripts/build-android-rust.sh")
}

android {
    namespace = "com.routevn.creator"
    compileSdk = 37
    buildToolsVersion = "37.0.0"
    ndkVersion = androidNdkVersion

    defaultConfig {
        applicationId = "com.routevn.creator"
        minSdk = 24
        targetSdk = 37
        versionCode = 9
        versionName = "1.15.1"
        buildConfigField("String", "UPDATE_DISTRIBUTION", javaString(routevnDistribution))
        buildConfigField("String", "UPDATE_API_URL", "\"https://api.routevn.com/system/rpc\"")
        buildConfigField("boolean", "GOOGLE_PLAY_UPDATES", (routevnDistribution == "google-play").toString())
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    signingConfigs {
        if (hasReleaseSigningConfig) {
            create("release") {
                storeFile = file(releaseKeystorePath!!)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "UPDATE_API_URL", javaString(routevnUpdateApiUrl))
            buildConfigField("boolean", "GOOGLE_PLAY_UPDATES", "true")
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }

        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )

            if (hasReleaseSigningConfig) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    testOptions { unitTests.isIncludeAndroidResources = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

tasks.matching {
    it.name == "mergeDebugJniLibFolders" ||
        it.name == "mergeReleaseJniLibFolders"
}.configureEach {
    dependsOn(buildAndroidRust)
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.17")

    constraints {
        implementation("androidx.fragment:fragment:1.9.0") {
            because("Google Play In-App Updates transitively requests an outdated Fragment release")
        }
        implementation("com.google.android.gms:play-services-basement:18.11.0") {
            because("Use current Play Services stability fixes with In-App Updates")
        }
        implementation("com.google.android.gms:play-services-tasks:18.4.1") {
            because("Keep the In-App Updates task runtime on the current stable release")
        }
        implementation("com.google.android.play:core-common:2.0.4") {
            because("Use the current Play Core common runtime with In-App Updates")
        }
    }

    implementation("com.google.android.play:app-update:2.1.0")
    implementation("androidx.core:core:1.19.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.webkit:webkit:1.17.0")
}

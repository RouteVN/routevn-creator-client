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

// Native crash reports go to the same public collector as the desktop app.
// Release builds always use the production DSN. Debug builds report only when
// `-ProutevnSentryDsn=<dsn>` is passed, for local collector checks.
val productionSentryDsn: String by lazy {
    val dsn = repoRoot.resolve(".env.production").readLines()
        .firstOrNull { it.startsWith("ROUTEVN_SENTRY_DSN=") }
        ?.substringAfter("=")
        ?.trim()
        ?.trim('"')
    require(!dsn.isNullOrBlank()) { "ROUTEVN_SENTRY_DSN must be set in .env.production" }
    dsn
}
val debugSentryDsn = providers.gradleProperty("routevnSentryDsn").orElse("").get()

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
        versionCode = 14
        versionName = "1.17.1"
        buildConfigField("String", "UPDATE_DISTRIBUTION", javaString(routevnDistribution))
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
            buildConfigField("String", "SENTRY_DSN", javaString(debugSentryDsn))
            buildConfigField("String", "SENTRY_ENVIRONMENT", javaString("development"))
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }

        release {
            buildConfigField("String", "SENTRY_DSN", javaString(productionSentryDsn))
            buildConfigField("String", "SENTRY_ENVIRONMENT", javaString("production"))
            // Keep native symbol tables so crash addresses can be decoded later.
            ndk { debugSymbolLevel = "SYMBOL_TABLE" }
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

// The collector does not decode stacks, so keep each release's R8 mapping and
// native symbol tables. See docs/mobile-crash-reporting.md.
val archiveReleaseCrashSymbols by tasks.registering(Copy::class) {
    val version = "${android.defaultConfig.versionName}-${android.defaultConfig.versionCode}"
    from(layout.buildDirectory.file("outputs/mapping/release/mapping.txt"))
    from(layout.buildDirectory.file("outputs/native-debug-symbols/release/native-debug-symbols.zip"))
    into(repoRoot.resolve(".artifacts/android-crash-symbols/$version"))
}

tasks.matching { it.name == "bundleRelease" || it.name == "assembleRelease" }.configureEach {
    finalizedBy(archiveReleaseCrashSymbols)
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.17")
    implementation("androidx.core:core:1.19.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.webkit:webkit:1.17.0")
    // Core and NDK only; the aggregate sentry-android artifact also ships replay.
    implementation("io.sentry:sentry-android-core:8.58.0")
    implementation("io.sentry:sentry-android-ndk:8.58.0")
}

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
        versionCode = 1
        versionName = "0.0.1"
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
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.webkit:webkit:1.16.0")
}
